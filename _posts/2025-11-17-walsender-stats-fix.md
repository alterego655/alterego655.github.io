---
layout: post
title: "Fixing WAL Sender Statistics: Making I/O Monitoring Work in Real-Time"
date: 2025-11-17
tags: [PostgreSQL, Database Systems, Monitoring, Replication, Performance]
excerpt: "How PostgreSQL 16+ gained real-time visibility into WAL sender I/O statistics by implementing periodic statistics flushing, transforming a post-mortem tool into a live monitoring capability."
---

[Commit: 039549d70f6aa2daa3714a13752a08fa8ca2fb05](https://git.postgresql.org/gitweb/?p=postgresql.git;a=commitdiff;h=039549d70f6aa2daa3714a13752a08fa8ca2fb05)

## The Problem: Invisible Statistics Until Process Exit

PostgreSQL's `pg_stat_io` view, introduced in version 16, provides crucial insights into I/O operations across different backend types. However, a significant limitation existed for WAL sender processes: **their statistics were only flushed when the process exited**.

For long-running WAL senders—which is the typical case in both streaming and logical replication—this meant administrators had no visibility into the I/O activity these critical processes were generating while they were running. You could only see the statistics after a WAL sender disconnected, making real-time monitoring impossible.

This was particularly problematic because:

1. **Replication is typically long-lived**: Standby servers and logical replication subscribers often run for days, weeks, or months without disconnecting
2. **I/O monitoring is crucial**: Understanding how much I/O WAL senders generate is important for capacity planning and performance troubleshooting
3. **No workaround existed**: The statistics simply weren't available until process termination

## Root Cause Analysis

The issue stemmed from PostgreSQL's statistics subsystem design. By default, backend processes accumulate statistics in local memory and only flush them periodically or at process exit. WAL senders were following this default behavior—accumulating statistics but never flushing them during normal operation.

WAL senders have two main code paths where they wait for activity:

1. **`WalSndWaitForWal()`**: Used by logical replication WAL senders waiting for new WAL records
2. **`WalSndLoop()`**: The main loop for physical replication WAL senders

Neither of these paths included statistics flushing logic, so the accumulated I/O statistics remained invisible in `pg_stat_io`.

## The Solution: Periodic Statistics Flushing

The fix implements aggressive statistics flushing for WAL senders, with a **1-second interval**. This provides near real-time visibility while keeping overhead minimal.

### Implementation Details

**1. Statistics Flush Interval**

A new constant defines the flush frequency:

```c
#define WALSENDER_STATS_FLUSH_INTERVAL  1000  /* milliseconds */
```

**2. Tracking Last Flush Time**

Both critical code paths now maintain a `last_flush` timestamp:

```c
TimestampTz last_flush = 0;
```

**3. Flush Logic Before Sleep**

Before each sleep (wait for activity), the code:

1. Gets the current timestamp (already needed for sleep time calculation)
2. Checks if 1 second has elapsed since the last flush
3. If so, flushes both I/O and backend statistics
4. Updates `last_flush`

**Example from `WalSndWaitForWal()`:**

```c
now = GetCurrentTimestamp();
sleeptime = WalSndComputeSleeptime(now);

/* Report IO statistics, if needed */
if (TimestampDifferenceExceeds(last_flush, now,
                               WALSENDER_STATS_FLUSH_INTERVAL))
{
    pgstat_flush_io(false);
    (void) pgstat_flush_backend(false, PGSTAT_BACKEND_FLUSH_IO);
    last_flush = now;
}

WalSndWait(wakeEvents, sleeptime, wait_event);
```

### Why Two Locations?

The fix required changes in two places because logical and physical WAL senders have different code paths:

- **Logical WAL senders** wait in `WalSndWaitForWal()` while their `send_data` callback (`XLogSendLogical`) handles data transmission
- **Physical WAL senders** primarily wait in the main `WalSndLoop()`, as their `send_data` doesn't block

## Performance Considerations

The implementation is designed for minimal overhead:

1. **Reuses existing timestamp**: The `GetCurrentTimestamp()` call was already being made for sleep time calculation
2. **Fast path check**: `TimestampDifferenceExceeds()` quickly returns if insufficient time has passed
3. **Non-blocking flush**: The `false` parameter to flush functions means they don't force synchronous disk writes
4. **Appropriate interval**: 1 second provides good visibility without excessive overhead

## Testing Strategy

The fix includes tests for both replication types:

**Physical Replication (`001_stream_rep.pl`):**
```perl
$node_primary->poll_query_until(
    'postgres',
    qq[SELECT sum(reads) > 0
        FROM pg_catalog.pg_stat_io
        WHERE backend_type = 'walsender'
        AND object = 'wal']
)
```

**Logical Replication (`001_rep_changes.pl`):**
```perl
$node_publisher->poll_query_until(
    'postgres',
    qq[SELECT sum(reads) > 0
        FROM pg_catalog.pg_stat_io
        WHERE backend_type = 'walsender'
        AND object = 'wal']
)
```

Both tests:
1. Reset statistics at the start: `SELECT pg_stat_reset_shared('io')`
2. Generate WAL activity through table operations
3. Poll until WAL sender I/O statistics appear in `pg_stat_io`
4. Run far enough from the statistics reset to ensure stable results

This stable testing approach only works on version 17+ where WAL data was added to `pg_stat_io` (commit a051e71e28a1).

## Impact and Backporting

- **Affects**: PostgreSQL 16 and later (since `pg_stat_io` introduction in a9c70b46dbe)
- **Backported to**: Version 16 (all supported versions with `pg_stat_io`)
- **User-visible change**: WAL sender statistics now appear in `pg_stat_io` within ~1 second

## Practical Benefits

After this fix, administrators can:

1. **Monitor replication I/O in real-time**: See how much WAL reading active replication connections are doing
2. **Troubleshoot performance issues**: Identify if WAL senders are I/O-bound while systems are running
3. **Capacity planning**: Understand the actual I/O load from replication without waiting for process termination
4. **Better observability**: Integrate WAL sender I/O metrics into monitoring dashboards with current data

## Conclusion

This fix transforms WAL sender I/O statistics from a post-mortem tool into a real-time monitoring capability. By adding periodic statistics flushing with minimal overhead, it completes the `pg_stat_io` vision of providing comprehensive I/O visibility across all PostgreSQL backend types, including the critical replication processes that often run for extended periods.

The fix is elegant in its simplicity: reuse existing timestamps, check elapsed time, and flush when appropriate. This pattern could serve as a model for other long-running backend types that might benefit from more frequent statistics updates.

