---
layout: post
title: "Per-Backend WAL Statistics: Bringing Granular Visibility to Write-Ahead Logging"
date: 2025-11-20
tags: [PostgreSQL, Database Systems, Monitoring, WAL, Performance, Observability]
excerpt: "How PostgreSQL gained per-backend WAL statistics visibility, enabling administrators to identify which connections generate the most WAL and diagnose write-heavy workloads with precision."
---

**Author:** Bertrand Drouvot <bertranddrouvot.pg@gmail.com>  
**Committer:** Michael Paquier <michael@paquier.xyz>  
**Reviewed-by:** Michael Paquier <michael@paquier.xyz>  
**Reviewed-by:** Nazir Bilal Yavuz <byavuz81@gmail.com>  
**Reviewed-by:** Xuneng Zhou <xunengzhou@gmail.com>

## The Problem: Only Cluster-Wide WAL Visibility

PostgreSQL's `pg_stat_wal` view provides valuable insights into Write-Ahead Logging (WAL) activity, tracking metrics like:
- Number of WAL records generated
- Number of full page images (FPI) written
- Total bytes of WAL data written
- Number of times WAL buffers were full

However, `pg_stat_wal` only shows **aggregate cluster-wide statistics**. When investigating performance issues or understanding workload characteristics, administrators often need to answer questions like:

- Which backend is generating the most WAL?
- Is WAL generation balanced across connections, or is one backend dominating?
- How much WAL does a specific long-running transaction produce?

Without per-backend visibility, these questions were impossible to answer directly. Administrators had to resort to indirect methods like examining query logs or making educated guesses based on the types of operations running.

## The Solution: Per-Backend WAL Statistics

This commit introduces per-backend WAL statistics, providing the same information as `pg_stat_wal` but broken down by individual backend process. This granular visibility enables real-time monitoring of WAL activity per connection, making it possible to identify unbalanced workloads, track heavy writers, and diagnose performance bottlenecks.

### New System Function: `pg_stat_get_backend_wal()`

A new system function allows retrieving WAL statistics for any backend by its process ID:

```sql
SELECT * FROM pg_stat_get_backend_wal(12345);
```

**Output fields** (matching `pg_stat_wal`):
- `wal_records` - Number of WAL records generated
- `wal_fpi` - Number of full page images
- `wal_bytes` - Total bytes of WAL generated
- `wal_buffers_full` - Times WAL buffers were full
- `stats_reset` - Timestamp of last statistics reset

**Typical usage pattern** - Join with `pg_stat_activity` for live analysis:

```sql
SELECT 
    a.pid,
    a.usename,
    a.application_name,
    a.state,
    w.wal_records,
    w.wal_bytes,
    w.wal_fpi
FROM pg_stat_activity a
CROSS JOIN LATERAL pg_stat_get_backend_wal(a.pid) w
WHERE a.backend_type = 'client backend'
ORDER BY w.wal_bytes DESC;
```

This query shows which active backends are generating the most WAL, enabling administrators to identify write-heavy connections.

### Backend Type Exclusions

The function does **not** return WAL statistics for certain backend types that are already tracked elsewhere or have specialized monitoring:

- Checkpointer
- Background writer
- Startup process
- Autovacuum launcher

These exclusions align with the backend statistics tracking policy established in the backend stats infrastructure.

## Implementation Architecture

### Data Structure Changes

The `PgStat_Backend` struct now includes WAL counters:

```c
typedef struct PgStat_Backend
{
    TimestampTz stat_reset_timestamp;
    PgStat_BktypeIO io_stats;           /* Existing I/O stats */
    PgStat_WalCounters wal_counters;    /* NEW: WAL stats */
} PgStat_Backend;
```

### Differential Tracking Mechanism

The implementation uses **differential tracking** to calculate WAL activity between flushes:

```c
static WalUsage prevBackendWalUsage;
```

This static variable stores the previous `pgWalUsage` counters. When statistics are flushed:

1. Calculate the difference: `current_pgWalUsage - prevBackendWalUsage`
2. Add the difference to the backend's shared statistics
3. Update `prevBackendWalUsage` to the current values

This approach ensures that each flush only reports **incremental** WAL activity since the last flush, avoiding double-counting and providing accurate per-backend metrics.

### Flush Logic Integration

The flush mechanism integrates with the existing backend statistics infrastructure through a new flag:

```c
#define PGSTAT_BACKEND_FLUSH_WAL   (1 << 1)
#define PGSTAT_BACKEND_FLUSH_ALL   (PGSTAT_BACKEND_FLUSH_IO | PGSTAT_BACKEND_FLUSH_WAL)
```

**Key function: `pgstat_flush_backend_entry_wal()`**

```c
static void
pgstat_flush_backend_entry_wal(PgStat_EntryRef *entry_ref)
{
    PgStatShared_Backend *shbackendent;
    PgStat_WalCounters *bktype_shstats;
    WalUsage wal_usage_diff = {0};

    /* Early exit if no WAL activity */
    if (!pgstat_backend_wal_have_pending())
        return;

    shbackendent = (PgStatShared_Backend *) entry_ref->shared_stats;
    bktype_shstats = &shbackendent->stats.wal_counters;

    /* Calculate incremental difference */
    WalUsageAccumDiff(&wal_usage_diff, &pgWalUsage, &prevBackendWalUsage);

    /* Accumulate into shared stats */
    WALSTAT_ACC(wal_buffers_full, wal_usage_diff);
    WALSTAT_ACC(wal_records, wal_usage_diff);
    WALSTAT_ACC(wal_fpi, wal_usage_diff);
    WALSTAT_ACC(wal_bytes, wal_usage_diff);

    /* Save current counters for next flush */
    prevBackendWalUsage = pgWalUsage;
}
```

### Integration with WAL Reporting

Backend WAL stats are flushed whenever `pgstat_report_wal()` is called:

```c
void
pgstat_report_wal(bool force)
{
    /* ... existing code ... */

    /* flush wal stats */
    (void) pgstat_wal_flush_cb(nowait);
    pgstat_flush_backend(nowait, PGSTAT_BACKEND_FLUSH_WAL);  /* NEW */

    /* flush IO stats */
    pgstat_flush_io(nowait);
    /* ... */
}
```

This ensures that per-backend WAL statistics are updated at the same frequency as cluster-wide WAL statistics, maintaining consistency between the two views.

### Initialization and Lifecycle

When a backend's statistics entry is created:

```c
void
pgstat_create_backend(ProcNumber procnum)
{
    /* ... create entry ... */

    /*
     * Initialize prevBackendWalUsage with pgWalUsage so that
     * pgstat_backend_flush_cb() can calculate how much pgWalUsage counters
     * are increased by subtracting prevBackendWalUsage from pgWalUsage.
     */
    prevBackendWalUsage = pgWalUsage;
}
```

This initialization is crucial: it sets the baseline for differential tracking, ensuring the first flush correctly reports only the WAL activity that occurred **after** the backend started tracking.

## Testing Strategy

The regression test suite includes verification of per-backend WAL statistics:

```sql
-- Test pg_stat_wal
SELECT wal_bytes AS wal_bytes_before FROM pg_stat_wal \gset

-- Test pg_stat_get_backend_wal()
SELECT wal_bytes AS backend_wal_bytes_before 
FROM pg_stat_get_backend_wal(pg_backend_pid()) \gset

-- Make a temp table so our temp schema exists
CREATE TEMP TABLE test_stats_temp AS SELECT 17;
DROP TABLE test_stats_temp;

-- Force checkpoint to generate WAL
CHECKPOINT;
CHECKPOINT;

-- Verify cluster-wide stats increased
SELECT wal_bytes > :wal_bytes_before FROM pg_stat_wal;

-- Force stats flush and verify per-backend stats increased
SELECT pg_stat_force_next_flush();
SELECT wal_bytes > :backend_wal_bytes_before 
FROM pg_stat_get_backend_wal(pg_backend_pid());
```

This test:
1. Captures baseline WAL stats (both cluster-wide and per-backend)
2. Generates WAL activity (temp table creation/deletion)
3. Verifies both views reflect the increased activity
4. Uses `pg_stat_force_next_flush()` to ensure backend stats are updated

## Technical Considerations

### Why No PGSTAT_FILE_FORMAT_ID Bump?

The commit explicitly notes that **`PGSTAT_FILE_FORMAT_ID` does not need a bump** because backend statistics are not persisted to disk. They exist only in shared memory for the lifetime of the backend process. When a backend exits, its statistics are lost (which is the intended behavior for transient, per-backend metrics).

### Catalog Version Bump

The catalog version was bumped from `202503071` to `202503111` because:
- A new system function (`pg_stat_get_backend_wal`) was added to `pg_proc.dat`
- The function signature and metadata must be reflected in the system catalog
- Any database using this feature must be initialized or upgraded with the new catalog definition

### Relationship to Backend Statistics Infrastructure

This commit builds directly on the foundation provided by commit `9aea73fc61d4`, which introduced the backend statistics subsystem. That infrastructure already handled:
- Per-backend shared memory management
- Entry creation and lifecycle
- Generic flush mechanisms with flags
- Lock management for concurrent access

This commit adds **WAL-specific logic** to that framework, demonstrating the extensibility of the backend stats design.

## Use Cases and Practical Benefits

### 1. Identifying Write-Heavy Connections

```sql
-- Find top 10 backends by WAL generation
SELECT 
    a.pid,
    a.usename,
    a.query,
    w.wal_bytes,
    pg_size_pretty(w.wal_bytes) AS wal_size,
    w.wal_records
FROM pg_stat_activity a
CROSS JOIN LATERAL pg_stat_get_backend_wal(a.pid) w
WHERE a.backend_type = 'client backend'
ORDER BY w.wal_bytes DESC
LIMIT 10;
```

**Use case**: During a performance incident, quickly identify which connections are generating the most WAL and potentially causing I/O bottlenecks.

### 2. Monitoring Long-Running Transactions

```sql
-- Track WAL generation by transaction duration
SELECT 
    a.pid,
    a.usename,
    a.state,
    now() - a.xact_start AS txn_duration,
    w.wal_bytes,
    w.wal_records,
    w.wal_fpi
FROM pg_stat_activity a
CROSS JOIN LATERAL pg_stat_get_backend_wal(a.pid) w
WHERE a.xact_start IS NOT NULL
  AND a.backend_type = 'client backend'
ORDER BY now() - a.xact_start DESC;
```

**Use case**: Detect transactions that are both long-running and generating significant WAL, which could impact replication lag or checkpoint performance.

### 3. Workload Balancing Analysis

```sql
-- Check if WAL generation is balanced across application connections
SELECT 
    a.application_name,
    count(*) AS connection_count,
    sum(w.wal_bytes) AS total_wal_bytes,
    avg(w.wal_bytes) AS avg_wal_per_connection,
    max(w.wal_bytes) AS max_wal_per_connection
FROM pg_stat_activity a
CROSS JOIN LATERAL pg_stat_get_backend_wal(a.pid) w
WHERE a.backend_type = 'client backend'
GROUP BY a.application_name
ORDER BY total_wal_bytes DESC;
```

**Use case**: Verify that application connection pools are distributing write workload evenly, or identify specific application instances generating disproportionate WAL.

### 4. Replication Impact Assessment

```sql
-- Estimate which backends contribute most to replication lag
WITH wal_activity AS (
    SELECT 
        a.pid,
        a.usename,
        w.wal_bytes,
        w.wal_records
    FROM pg_stat_activity a
    CROSS JOIN LATERAL pg_stat_get_backend_wal(a.pid) w
    WHERE a.backend_type = 'client backend'
)
SELECT 
    pid,
    usename,
    pg_size_pretty(wal_bytes) AS wal_generated,
    round(100.0 * wal_bytes / sum(wal_bytes) OVER (), 2) AS pct_of_total
FROM wal_activity
WHERE wal_bytes > 0
ORDER BY wal_bytes DESC;
```

**Use case**: When replication lag is high, identify which backends are contributing the most to the WAL stream that replicas must process.

## Design Rationale

### Why Differential Tracking?

The implementation tracks **differences** rather than absolute values because:

1. **Avoids double-counting**: Each flush reports only new activity since the last flush
2. **Handles counter resets**: If `pgWalUsage` is reset, the differential approach naturally adapts
3. **Matches cluster-wide behavior**: The cluster-wide `pg_stat_wal` uses similar differential tracking
4. **Efficient**: No need to maintain separate per-backend accumulators; leverage the existing `pgWalUsage` global

### Why Not Persist to Disk?

Backend statistics are intentionally ephemeral:

1. **Transient nature**: Per-backend stats are only meaningful while the backend is running
2. **Volume**: With hundreds of backends, persisting per-backend stats would significantly increase I/O overhead
3. **Use case alignment**: The primary use case is **live monitoring**, not historical analysis
4. **Consistency**: Matches the design of other per-backend stats (like I/O stats)

## Relationship to WAL Sender Statistics Fix

This commit is **complementary** to the earlier WAL sender statistics fix (which added periodic flushing to WAL senders). Together, they provide:

- **WAL Sender Fix**: Ensures WAL sender I/O stats are visible in `pg_stat_io` while running
- **This Commit**: Provides per-backend WAL generation stats for all backend types

Both are part of a broader effort to improve observability of WAL-related activity in PostgreSQL.

## Future Directions

This infrastructure enables several potential enhancements:

1. **pg_stat_activity integration**: Could add WAL columns directly to `pg_stat_activity` for easier access
2. **Historical tracking**: External monitoring tools can now poll per-backend WAL stats and build time-series data
3. **Alerting**: Set up alerts for backends exceeding WAL generation thresholds
4. **Query-level attribution**: Combined with query tracking, could attribute WAL generation to specific query patterns

## Conclusion

Per-backend WAL statistics represent a significant improvement in PostgreSQL's observability. By exposing WAL generation at the individual backend level, this feature enables:

- **Precise diagnosis** of write-heavy workloads
- **Proactive monitoring** of WAL activity before it causes problems
- **Better understanding** of application behavior and its impact on the database
- **Data-driven optimization** of connection pooling and workload distribution

The implementation leverages the existing backend statistics infrastructure, demonstrating the value of extensible design. The differential tracking mechanism ensures accurate, efficient statistics collection with minimal overhead.

For database administrators managing production PostgreSQL systems, this feature transforms WAL monitoring from a cluster-wide black box into a detailed, per-connection visibility tool—making it possible to answer the question "which backend is writing all this WAL?" with confidence.

