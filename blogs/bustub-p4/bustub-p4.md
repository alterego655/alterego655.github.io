Bring mvcc to bustub

MVCC is a widely used technique in almost all modern DBMSs like Oracle, Postgres and MSSQL. Compared with two-phase locking, the main benifit of MVCC is to allow writer do not block reader which enhance overall concurrency. 

You're absolutely right. The thread safety is provided by the
  TransactionManager's external locking. This is a common pattern where:

  1. TransactionManager holds a mutex (likely txn_map_mutex_)
  2. All watermark operations happen while holding that mutex
  3. The watermark class is a simple data structure without internal
  locking

  This design makes sense because:
  - Avoids nested locking complexity
  - Better performance (single lock acquisition)
  - Watermark updates are naturally part of transaction state changes

  So the amortized O(1) design I proposed is valid in this context. The
  external synchronization ensures:
  - No concurrent modifications to current_reads_
  - Consistent view of min_timestamp_ and needs_recompute_
  - Atomic transaction state transitions

  The watermark is essentially a "private" component of
  TransactionManager, protected by its locking protocol.

> write the desgin for me to review

⏺ Update Todos
  ⎿  ☐ Design amortized O(1) watermark algorithm         
     ☐ Implement AddTxn with O(1) complexity
     ☐ Implement RemoveTxn with amortized O(1) complexity
     ☐ Update GetWatermark for lazy recomputation

⏺ Here's my design for the amortized O(1) watermark algorithm:

  Watermark Amortized O(1) Design

  Data Structure Changes

  class Watermark {
    timestamp_t commit_ts_;
    timestamp_t watermark_;
    std::unordered_map<timestamp_t, int> current_reads_;  // timestamp → 
  count

    // Remove sorted_reads_ set
    // Add these for O(1) amortized:
    timestamp_t min_read_ts_{std::numeric_limits<timestamp_t>::max()};
    bool stale_min_{false};  // true when min_read_ts_ might be outdated
  };

  Implementation

  AddTxn(timestamp_t read_ts) - O(1)
  void AddTxn(timestamp_t read_ts) {
    if (read_ts < commit_ts_) {
      throw Exception("read ts < commit ts");
    }

    // First transaction with this timestamp
    if (current_reads_[read_ts]++ == 0) {
      // Update min if this is smaller
      if (read_ts < min_read_ts_) {
        min_read_ts_ = read_ts;
        stale_min_ = false;  // We know this is the true minimum
      }
    }
    watermark_ = min_read_ts_;
  }

  RemoveTxn(timestamp_t read_ts) - O(1) amortized
  void RemoveTxn(timestamp_t read_ts) {
    auto it = current_reads_.find(read_ts);
    if (it == current_reads_.end()) {
      throw Exception("trying to remove non-existent read timestamp");
    }

    if (--it->second == 0) {
      current_reads_.erase(it);

      // If we removed the minimum, mark it as stale
      if (read_ts == min_read_ts_) {
        stale_min_ = true;
        // Don't recompute now - lazy evaluation
      }
    }
  }

  GetWatermark() - O(1) amortized
  timestamp_t GetWatermark() {
    if (current_reads_.empty()) {
      return commit_ts_;
    }

    // Recompute min only when necessary
    if (stale_min_) {
      min_read_ts_ = std::numeric_limits<timestamp_t>::max();
      for (const auto& [ts, count] : current_reads_) {
        min_read_ts_ = std::min(min_read_ts_, ts);
      }
      stale_min_ = false;
    }

    watermark_ = min_read_ts_;
    return watermark_;
  }

  Complexity Analysis

  - AddTxn: Always O(1) - hash map insert + simple comparison
  - RemoveTxn: O(1) - only sets a flag when min is removed
  - GetWatermark: O(1) most calls, O(n) when recomputation needed
    - Amortized O(1) because recomputation happens at most once per
  RemoveTxn of minimum

  Key Benefits

  1. No sorting overhead from set operations
  2. Lazy evaluation avoids unnecessary recomputation
  3. Simple implementation with minimal state
  4. Thread-safe when called under TransactionManager's lock

⏺ Update Todos
  ⎿  ☒ Design amortized O(1) watermark algorithm         
     ☐ Implement AddTxn with O(1) complexity
     ☐ Implement RemoveTxn with amortized O(1) complexity
     ☐ Update GetWatermark for lazy recomputation

> if we decide to relax the lock for commit and abort, how do we 
  sychronize these fields properly?

⏺ If we relax the lock for commit/abort, we need fine-grained
  synchronization. Here's a thread-safe design:

  Thread-Safe Watermark Design

  Option 1: Atomic Operations + Spinlock for Recomputation

  class Watermark {
    std::atomic<timestamp_t> commit_ts_;
    std::atomic<timestamp_t> watermark_;

    // Use concurrent hash map or protect with mutex
    tbb::concurrent_hash_map<timestamp_t, std::atomic<int>>
  current_reads_;

    std::atomic<timestamp_t> min_read_ts_;
    std::atomic<bool> stale_min_{false};
    std::mutex recompute_mutex_;  // Only for recomputation
  };

  Option 2: Lock-Free with Epoch-Based Design

  class Watermark {
    struct TimestampEntry {
      std::atomic<int> count{0};
      std::atomic<bool> active{true};
    };

    std::atomic<timestamp_t> commit_ts_;
    std::atomic<timestamp_t> watermark_;

    // Fixed-size array for common case (recent timestamps)
    static constexpr size_t CACHE_SIZE = 1024;
    std::array<TimestampEntry, CACHE_SIZE> timestamp_cache_;

    // Overflow to concurrent map for older timestamps
    tbb::concurrent_hash_map<timestamp_t, int> overflow_;

    std::atomic<timestamp_t> min_cached_{UINT64_MAX};
    std::atomic<uint64_t> epoch_{0};  // Increment on min change
  };

  Option 3: Read-Write Lock (Simpler)

  class Watermark {
    mutable std::shared_mutex rw_mutex_;

    timestamp_t commit_ts_;
    timestamp_t watermark_;
    std::unordered_map<timestamp_t, int> current_reads_;
    timestamp_t min_read_ts_;
    bool stale_min_;

    // AddTxn/RemoveTxn use unique_lock (write)
    // GetWatermark uses shared_lock (read), upgrades if recompute needed
  };

  Recommended Approach: Atomic + Mutex Hybrid

  class Watermark {
    std::atomic<timestamp_t> commit_ts_;
    std::atomic<timestamp_t> watermark_;

    // Protect the map and recomputation
    mutable std::mutex mutex_;
    std::unordered_map<timestamp_t, int> current_reads_;
    timestamp_t min_read_ts_{UINT64_MAX};
    bool stale_min_{false};

  public:
    void AddTxn(timestamp_t read_ts) {
      std::lock_guard<std::mutex> lock(mutex_);
      if (current_reads_[read_ts]++ == 0) {
        if (read_ts < min_read_ts_) {
          min_read_ts_ = read_ts;
          stale_min_ = false;
          watermark_.store(min_read_ts_);
        }
      }
    }

    void RemoveTxn(timestamp_t read_ts) {
      std::lock_guard<std::mutex> lock(mutex_);
      auto it = current_reads_.find(read_ts);
      if (--it->second == 0) {
        current_reads_.erase(it);
        if (read_ts == min_read_ts_) {
          stale_min_ = true;
        }
      }
    }

    timestamp_t GetWatermark() {
      // Fast path - try atomic read first
      if (!stale_min_.load()) {
        return current_reads_.empty() ?
          commit_ts_.load() : watermark_.load();
      }

      // Slow path - recompute under lock
      std::lock_guard<std::mutex> lock(mutex_);
      if (stale_min_) {  // Double-check
        RecomputeMin();
      }
      return watermark_.load();
    }

    void UpdateCommitTs(timestamp_t ts) {
      commit_ts_.store(ts);
    }
  };

  This provides:
  - Lock-free read for common case
  - Mutex protection only when needed
  - Safe concurrent access from multiple transactions
  - Atomics for frequently read values



⏺ The distinction between .load() + 1 and .fetch_add(1) in this commit process is crucial for maintaining consistency
  with how transactions obtain their read timestamps in Begin().

  Key insight: In Begin(), new transactions set their read_ts_ to last_commit_ts_.load(), which means they read at the
  timestamp of the last committed transaction.

  The two-phase commit timestamp approach:

  1. Phase 1 - Tentative timestamp (.load() + 1):
    - You read the current last_commit_ts_ and add 1 to get a tentative commit timestamp
    - This doesn't actually modify last_commit_ts_ yet
    - Multiple transactions can concurrently get tentative timestamps
  2. Phase 2 - Actual increment (.fetch_add(1)):
    - Only after verification passes and you're sure the transaction will commit
    - Actually increment last_commit_ts_ atomically
    - This ensures no gaps in commit timestamps if verification fails

  Why this matters:
  - If you used .fetch_add(1) early to get the commit timestamp, you'd increment last_commit_ts_ before knowing if the
  transaction will actually commit
  - If verification then fails, you'd have a gap in commit timestamps
  - New transactions starting via Begin() would see this incremented value even though no transaction actually committed
   at that timestamp
  - This could break snapshot isolation guarantees

  Example scenario:
  T1: last_commit_ts_ = 10
  T2: Begin() → read_ts_ = 10
  T3: Starts committing, if we used fetch_add(1) → gets ts 11, last_commit_ts_ = 11
  T4: Begin() → read_ts_ = 11 (sees T3's timestamp even though T3 hasn't committed yet!)
  T3: Verification fails, aborts
  → Problem: T4 has read_ts_ = 11 but no transaction actually committed at timestamp 11

  This approach ensures commit timestamps are only incremented for successfully committed transactions, maintaining
  consistency with how Begin() assigns read timestamps.