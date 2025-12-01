---
layout: post
title: "Fixing Stalled Lag Columns in pg_stat_replication"
date: 2025-11-20
tags: [PostgreSQL, Database Systems, Monitoring, Replication, Performance, Bug Fix]
excerpt: "How PostgreSQL fixed a critical bug where write_lag and flush_lag columns would freeze in pg_stat_replication when replay LSN stopped advancing, breaking replication monitoring during recovery conflicts."
---

**Author:** Fujii Masao <masao.fujii@gmail.com>  
**Committer:** Fujii Masao <fujii@postgresql.org>  
**Reviewed-by:** Chao Li <lic@highgo.com>  
**Reviewed-by:** Shinya Kato <shinya11.kato@gmail.com>  
**Reviewed-by:** Xuneng Zhou <xunengzhou@gmail.com>

## The Problem: Lag Monitoring Breaks During Recovery Conflicts

PostgreSQL's `pg_stat_replication` view provides critical visibility into replication lag through three time-based columns:
- `write_lag` - Time elapsed between flushing WAL locally and receiving notification that the standby has written it
- `flush_lag` - Time elapsed between flushing WAL locally and receiving notification that the standby has flushed it
- `replay_lag` - Time elapsed between flushing WAL locally and receiving notification that the standby has applied it

However, a subtle but significant bug existed: **when the replay LSN from a standby stopped advancing, the `write_lag` and `flush_lag` columns would initially update correctly but then freeze**, preventing administrators from accurately monitoring replication health.

### When Does Replay LSN Stop Advancing?

Several real-world scenarios can cause replay LSN to stall while write and flush LSNs continue advancing:

1. **Recovery Conflicts**: When a standby encounters a conflict (e.g., a query holding a lock conflicts with incoming WAL), replay pauses while write and flush continue
2. **Hot Standby Feedback Delays**: Cleanup records might be delayed, causing replay to wait
3. **Long-Running Queries on Standby**: Queries that hold snapshots can block replay of certain WAL records
4. **Deliberate Replay Delays**: `recovery_min_apply_delay` configuration intentionally delays replay

In all these cases, the standby is still **receiving and flushing WAL** (so it won't fall behind on disk), but replay is paused. Monitoring tools need to see that `write_lag` and `flush_lag` continue updating to confirm the standby is still healthy—just waiting to apply the data.

### Impact on Operations

When lag columns freeze, it creates serious operational problems:

```sql
-- During a recovery conflict, users would see something like:
SELECT application_name, 
       state,
       write_lag,
       flush_lag,
       replay_lag
FROM pg_stat_replication;

 application_name | state     | write_lag | flush_lag | replay_lag
------------------+-----------+-----------+-----------+------------
 standby1         | streaming | 00:00:01  | 00:00:01  | 00:00:05
 
-- A few seconds later, all three columns are stuck:
 standby1         | streaming | 00:00:01  | 00:00:01  | 00:00:05
 
-- Making it impossible to tell if replication is healthy!
```

This prevented answering critical questions:
- Is the standby still receiving WAL?
- Is the network connection still working?
- Should we promote the standby, or is it just temporarily delayed?

## Root Cause: The Lag Tracker Cyclic Buffer

### How the Lag Tracker Works

The lag tracker uses a **cyclic buffer** to compute round-trip times. The architecture is:

```c
#define LAG_TRACKER_BUFFER_SIZE 8192

typedef struct
{
    XLogRecPtr  lsn;                /* WAL position written locally */
    TimestampTz time;               /* Local timestamp when written */
} WalTimeSample;

typedef struct
{
    WalTimeSample buffer[LAG_TRACKER_BUFFER_SIZE];
    int         write_head;         /* Where to write next sample */
    int         read_heads[NUM_SYNC_REP_WAIT_MODE];  /* Where each reader is */
    WalTimeSample last_read[NUM_SYNC_REP_WAIT_MODE];
} LagTracker;
```

**The algorithm:**

1. **Write side** (`LagTrackerWrite`): When WAL is flushed locally, record `(LSN, local_time)` at `write_head` and advance it
2. **Read side** (`LagTrackerRead`): When feedback arrives from standby with LSN `X`, find the sample with that LSN in the buffer and compute `now - local_time` = lag

There are **three read heads**, one for each lag type (write, flush, replay), because they advance at different rates.

### The Bug: Buffer Overflow Handling

The problem occurred when the cyclic buffer filled up:

```
Buffer: [ S0 ] [ S1 ] [ S2 ] [ S3 ] [ S4 ] [ S5 ] [ S6 ] [ S7 ]
              write_head ^                 ^replay_read_head
```

If `write_head + 1` equals `replay_read_head` (the slowest reader), the buffer is full.

**The old broken approach:**

```c
// Old code when buffer full
if (buffer_full)
{
    new_write_head = lag_tracker->write_head;
    if (lag_tracker->write_head > 0)
        lag_tracker->write_head--;
    else
        lag_tracker->write_head = LAG_TRACKER_BUFFER_SIZE - 1;
}
```

This **rewound the write head** and overwrote the previous sample. The problems:

1. **Lost samples**: Overwrites recent data, reducing accuracy
2. **Stuck read heads**: The slowest read head (replay) never advances because its target LSN is overwritten
3. **Cascade effect**: Once replay read head stalls, it prevents the buffer from draining, causing write and flush read heads to eventually stall too
4. **Broken lag computation**: All three lag values freeze because no new samples can be processed

### Why This Particularly Affected Replay Stalls

When replay LSN stops advancing but write and flush continue:

1. The replay read head stops moving (no new replay LSN to read)
2. New samples pile up at the write head (write and flush continue)
3. Buffer fills up quickly
4. Write head starts overwriting, but replay read head is still stuck on the old LSN
5. Write and flush read heads can't advance past the replay read head
6. **All three lag columns freeze**, even though write and flush should keep updating

## The Solution: Overflow Entries

The fix introduces a clever mechanism: **when the buffer fills due to a slow reader, move that reader's current sample to an overflow entry and free its space in the buffer**.

### New Data Structure

```c
typedef struct
{
    WalTimeSample buffer[LAG_TRACKER_BUFFER_SIZE];
    int         write_head;
    int         read_heads[NUM_SYNC_REP_WAIT_MODE];
    WalTimeSample last_read[NUM_SYNC_REP_WAIT_MODE];
    WalTimeSample overflowed[NUM_SYNC_REP_WAIT_MODE];  /* NEW */
} LagTracker;
```

Three overflow entries, one per lag type (write, flush, replay).

### Modified Write Logic

```c
new_write_head = (lag_tracker->write_head + 1) % LAG_TRACKER_BUFFER_SIZE;
for (i = 0; i < NUM_SYNC_REP_WAIT_MODE; ++i)
{
    /*
     * If the buffer is full, move the slowest reader to a separate
     * overflow entry and free its space in the buffer so the write head
     * can advance.
     */
    if (new_write_head == lag_tracker->read_heads[i])
    {
        lag_tracker->overflowed[i] =
            lag_tracker->buffer[lag_tracker->read_heads[i]];
        lag_tracker->read_heads[i] = -1;  /* Mark as in overflow */
    }
}

/* Now we can safely write the new sample */
lag_tracker->buffer[new_write_head].lsn = lsn;
lag_tracker->buffer[new_write_head].time = local_flush_time;
lag_tracker->write_head = new_write_head;
```

**Key insight**: By moving the blocking sample to overflow storage and marking the read head as `-1`, we free up the buffer slot so the write head can continue advancing. Other (faster) read heads can also continue progressing.

### Modified Read Logic

```c
if (lag_tracker->read_heads[head] == -1)
{
    /* This reader is in overflow mode */
    
    if (lag_tracker->overflowed[head].lsn > lsn)
    {
        /* Standby still hasn't caught up to the overflow entry */
        return (now >= lag_tracker->overflowed[head].time) ?
            now - lag_tracker->overflowed[head].time : -1;
    }
    
    /* Standby caught up! Switch back to buffer mode */
    time = lag_tracker->overflowed[head].time;
    lag_tracker->last_read[head] = lag_tracker->overflowed[head];
    lag_tracker->read_heads[head] =
        (lag_tracker->write_head + 1) % LAG_TRACKER_BUFFER_SIZE;
}

/* Now read from buffer as normal */
while (lag_tracker->read_heads[head] != lag_tracker->write_head &&
       lag_tracker->buffer[lag_tracker->read_heads[head]].lsn <= lsn)
{
    /* Process samples... */
}
```

**The two-phase reading:**

1. **Overflow phase**: While the standby's reported LSN hasn't reached the overflow entry's LSN, compute lag based on the overflow entry's timestamp
2. **Recovery phase**: Once the standby catches up to the overflow LSN, switch back to normal buffer-based reading from the oldest available entry

### Example Scenario

**Initial state**: Recovery conflict causes replay LSN to stall at position `1000`

```
Time  | Write LSN | Flush LSN | Replay LSN | Buffer State
------|-----------|-----------|------------|---------------------------
T0    | 1000      | 1000      | 1000       | All read heads at S0
T1    | 1500      | 1200      | 1000       | Replay stuck, buffer filling
T2    | 2000      | 1800      | 1000       | Buffer full, replay head blocks write
```

**With old code**: All lag columns freeze at T2

**With new code**:

```
T2    | 2000      | 1800      | 1000       | Replay moved to overflow entry
                                            | read_heads[replay] = -1
                                            | overflowed[replay] = {lsn:1000, time:T0}
                                            | Write and flush read heads continue!

T3    | 2500      | 2200      | 1000       | write_lag and flush_lag still updating
                                            | replay_lag computed from overflow entry
                                            | replay_lag = now - T0 (keeps growing)

T4    | 3000      | 2800      | 2500       | Conflict resolved! Replay advances
                                            | Replay LSN (2500) > overflow LSN (1000)
                                            | Switch back to buffer mode
                                            | read_heads[replay] reset to oldest buffer entry
```

## Impact and Benefits

### Before the Fix

```sql
-- During recovery conflict:
postgres=# SELECT application_name, write_lag, flush_lag, replay_lag 
           FROM pg_stat_replication;
           
 application_name | write_lag | flush_lag | replay_lag
------------------+-----------+-----------+------------
 standby1         | 00:00:02  | 00:00:02  | 00:00:02    -- Stuck!
 
-- 30 seconds later, conflict still ongoing:
 standby1         | 00:00:02  | 00:00:02  | 00:00:02    -- Still stuck!

-- Is replication broken? Is standby frozen? Impossible to tell!
```

### After the Fix

```sql
-- During recovery conflict:
postgres=# SELECT application_name, write_lag, flush_lag, replay_lag 
           FROM pg_stat_replication;
           
 application_name | write_lag | flush_lag | replay_lag
------------------+-----------+-----------+------------
 standby1         | 00:00:01  | 00:00:01  | 00:00:05
 
-- 30 seconds later, conflict still ongoing:
 standby1         | 00:00:01  | 00:00:02  | 00:00:35
 
-- Now we can see:
-- - write_lag and flush_lag are healthy (1-2 seconds)
-- - replay_lag is growing (35 seconds)
-- - Standby is receiving WAL fine, just delayed in applying it
```

### Operational Improvements

1. **Accurate Health Monitoring**: Distinguish between "standby disconnected" vs "standby delayed"
2. **Better Alerting**: Set alerts on growing `replay_lag` without false positives from frozen counters
3. **Informed Decisions**: Know whether a failover is urgent (network issue) or can wait (temporary conflict)
4. **Capacity Planning**: Understand the true distribution of lag across different replication stages

## Technical Design Considerations

### Why Not a Larger Buffer?

One might ask: why not just make the buffer bigger to avoid overflow?

**Answer**: The buffer is already 8192 entries. At typical WAL generation rates, this represents significant time. The real issue isn't buffer size—it's that one reader can block all progress. The overflow mechanism **decouples** slow readers from fast readers, which is the correct architectural solution.

### Why Track Three Separate Overflows?

Each lag type (write, flush, replay) can advance at different rates:
- Write lag is typically fastest (standby writes to OS)
- Flush lag is slightly slower (standby fsyncs to disk)
- Replay lag can be much slower (standby applies changes, possibly delayed by conflicts)

By maintaining separate overflow entries, each lag type can stall independently without affecting the others.

### Clock Skew Handling

The code includes protection against clock drift:

```c
return (now >= lag_tracker->overflowed[head].time) ?
    now - lag_tracker->overflowed[head].time : -1;
```

If the local flush time is in the future (due to clock drift between samples), return `-1` to indicate no valid measurement rather than a negative lag value.

### Memory Overhead

The memory increase is minimal:
- Added 3 × `WalTimeSample` = 3 × (8 bytes + 8 bytes) = 48 bytes
- In the context of an 8192-entry buffer (131 KB), this is negligible (0.04% increase)

## Related Monitoring Queries

**Detect standbys with stalled replay but healthy write/flush:**

```sql
SELECT application_name,
       client_addr,
       state,
       write_lag,
       flush_lag,
       replay_lag,
       pg_wal_lsn_diff(flush_lsn, replay_lsn) AS unplayed_bytes,
       replay_lag > flush_lag + interval '10 seconds' AS possible_conflict
FROM pg_stat_replication
WHERE state = 'streaming'
ORDER BY replay_lag DESC NULLS LAST;
```

**Track lag trends over time:**

```sql
-- Run periodically (e.g., every 10 seconds)
INSERT INTO replication_lag_history
SELECT now(),
       application_name,
       extract(epoch from write_lag) AS write_lag_sec,
       extract(epoch from flush_lag) AS flush_lag_sec,
       extract(epoch from replay_lag) AS replay_lag_sec
FROM pg_stat_replication;

-- Analyze patterns
SELECT application_name,
       avg(replay_lag_sec - flush_lag_sec) AS avg_replay_delay,
       max(replay_lag_sec - flush_lag_sec) AS max_replay_delay
FROM replication_lag_history
WHERE recorded_at > now() - interval '1 hour'
GROUP BY application_name;
```

## Conclusion

This fix addresses a critical gap in PostgreSQL's replication monitoring. By introducing overflow entries for the lag tracker, it ensures that `write_lag` and `flush_lag` continue updating even when `replay_lag` stalls, providing accurate visibility into replication health.

The solution is elegant: rather than preventing buffer overflow through rewinding (which caused all readers to stall), it **isolates the slow reader** in an overflow entry while allowing other readers and the writer to continue. This decoupling is the key architectural improvement.

