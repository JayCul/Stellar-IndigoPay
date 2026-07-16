# IndigoPay Indexing Services

IndigoPay runs two complementary indexing services that together provide
complete coverage of on-chain activity:

1. **Horizon SSE Indexer** — listens for raw Stellar payment operations (XLM and USDC).
2. **Soroban RPC Event Service** — polls contract events from the Soroban RPC for
   contract-only activity (badge mints, governance, project registrations, USDC donations).

---

## Soroban RPC Event Service

The Soroban event service (`sorobanEventService.js`) polls the Soroban RPC
`getEvents` endpoint every **5 seconds** for all events emitted by the
IndigoPay contract. It complements the Horizon SSE indexer by capturing
contract-only events that the Horizon stream cannot see.

### Events Processed

| Event       | Source                | Handler Action                                      |
| ----------- | --------------------- | --------------------------------------------------- |
| `donated`   | `donate()` / `donate_usdc()` | Insert donation record into DB, update project + donor profile |
| `proj_reg`  | `register_project()`  | Logged for audit                                    |
| `nft_mint`  | Auto-mint on badge upgrade | Logged for audit                                    |
| `pnft_mint` | Project milestone NFT | Logged for audit                                    |
| `voted`     | `vote_verify_project()`| Logged for audit                                    |
| `proj_ver`  | Governance resolution | Updates `projects.on_chain_verified = TRUE`         |
| `prop_rej`  | Proposal rejection    | Logged for audit                                    |
| `prop_veto` | Admin veto            | Logged for audit                                    |
| `prop_new`  | Proposal creation     | Logged for audit                                    |
| `deact_all` | Bulk deactivation     | Logged for audit                                    |
| `co2_rate`  | CO₂ rate update       | Logged for audit                                    |
| `prj_pause` | Project paused        | Logged for audit                                    |
| `prj_resm`  | Project resumed       | Logged for audit                                    |
| `usdc_set`  | USDC token configured | Logged for audit                                    |
| `sub_creat` | Subscription created  | Logged for audit (future)                           |
| `sub_canc`  | Subscription canceled | Logged for audit (future)                           |

### Cursor Persistence

- The latest event `pagingToken` is persisted to the `indexer_state` table
  (`key = 'soroban_event_cursor'`) after every successful batch.
- On restart, the service resumes from the last persisted cursor — no events
  are missed during downtime.

### Deduplication

- An in-memory `Set<string>` tracks all pagingTokens processed in the current
  session, pruned to a maximum of 100,000 entries.
- The `donated` handler additionally checks the `donations.transaction_hash`
  column to prevent double-inserting if the Horizon indexer already recorded the
  same donation.

### Dead-Letter Queue

- Events that fail processing are written to the `soroban_event_dlq` table with
  full event data, error message, and stack trace.
- DLQ entries are not automatically retried but can be inspected and replayed
  via the admin API.

### Batch Commit

- Events are fetched with `limit: 50` per RPC call.
- The `donated` handler wraps its DB writes in a PostgreSQL transaction
  (`BEGIN` / `COMMIT` / `ROLLBACK`).
- Non-mutating handlers (log-only) do not require transactions.

### Prometheus Metrics

| Metric                                      | Type    | Labels            | Description                                   |
| ------------------------------------------- | ------- | ----------------- | --------------------------------------------- |
| `indigopay_soroban_events_processed_total`  | Counter | `event_type`, `outcome` | Events processed by type and outcome (success/failed/skipped) |
| `indigopay_soroban_events_lag_ledgers`      | Gauge   | —                 | Ledger lag for event processing               |
| `indigopay_soroban_events_running`          | Gauge   | —                 | 1 if the polling loop is running, 0 otherwise |
| `indigopay_soroban_events_batch_duration_seconds` | Gauge | —            | Duration of the last batch processing cycle   |

### Admin API

| Endpoint                             | Method | Auth  | Description                                   |
| ------------------------------------ | ------ | ----- | --------------------------------------------- |
| `/api/v1/admin/events/status`        | GET    | Admin | Returns service status (running, cursor, etc.) |
| `/api/v1/admin/events/rescan`        | POST   | Admin | Triggers re-scan from provided or start cursor |
| `/api/v1/admin/events/restart`       | POST   | Admin | Stops and restarts the polling loop            |

### Configuration

| Variable               | Default                                | Description                             |
| ---------------------- | -------------------------------------- | --------------------------------------- |
| `SOROBAN_RPC_URL`      | `https://soroban-testnet.stellar.org`  | Soroban RPC endpoint                    |
| `CONTRACT_ID`          | —                                      | IndigoPay contract address              |
| `SOROBAN_RPC_MAX_RETRIES` | `3`                                 | Max retries per RPC call (exponential backoff) |
| Poll interval          | 5 seconds                              | —                                       |
| Batch size             | 50 events                              | —                                       |

### Code Reference

| File                                          | Purpose                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `backend/src/services/sorobanEventService.js` | Core service — polling, dispatch, dedup, DLQ, metrics |
| `backend/src/routes/admin/events.js`          | Admin endpoints (status, rescan, restart)            |
| `backend/src/db/migrations/015_indexer_state.js` | Creates `indexer_state` and `soroban_event_dlq` tables |
| `backend/src/services/stellar.js`             | Shared `rpcServer`, `withRetry`, `rpcBreaker`        |
| `backend/src/server.js`                       | Starts the service and registers shutdown hooks      |

---

## Horizon Indexer Service (Legacy header preserved)

---

## How It Works

### SSE Stream

The indexer uses the [Stellar SDK](https://github.com/stellar/js-stellar-sdk) `OperationsCallBuilder` to open a **Server-Sent Events (SSE)** connection to Horizon. The stream delivers real-time operations as they are included in ledgers.

```js
stellarServer.operations().cursor("now").stream({ onmessage, onerror });
```

- The `operations()` endpoint returns all operations on the network.
- Only `type === "payment"` operations are processed.
- Two asset types are accepted:
  - **Native XLM** (`asset_type === "native"`)
  - **USDC** (`asset_type === "credit_alphanum4"`, `asset_code === "USDC"`, and `asset_issuer` matching the configured `USDC_TOKEN_ADDRESS`)
- A filter matches the payment recipient (`op.to`) against an in-memory cache of active project wallets.

### Cursor Tracking

- The stream starts at `cursor("now")` — it does **not** replay historical ledgers.
- The last processed ledger sequence is held in a **module-level in-memory variable** (`lastProcessedLedger`).
- The cursor is **not persisted** to the database or any external store.
- On process restart, the indexer starts from `"now"` again, missing any operations that occurred during the downtime.

### Reconnect Logic

- The indexer **relies entirely on the Stellar SDK's built-in SSE reconnection**.
- There is no custom exponential backoff, health-check pings, or stream state monitoring beyond an `isRunning` flag that prevents duplicate `startIndexer` calls.
- On stream error, the `onerror` callback logs the error, but the SDK handles reconnection internally.

### Donation Processing Pipeline

When a matching payment arrives:

1. **Currency detection** — Determines if the payment is XLM or USDC based on `asset_type` and `asset_issuer`.
2. **Amount normalization** — For USDC, the raw amount is stored in the `amount` column; `amount_xlm` is left `null`. The XLM-equivalent is computed using `USDC_TO_XLM_RATE` for `raised_xlm` increment and donor profile updates.
3. **Deduplication** — Checks if the `transaction_hash` already exists in the `donations` table.
4. **Insert donation** — Writes a new row with `project_id`, `donor_address`, `amount_xlm` (null for USDC), `amount`, `currency`, `transaction_hash`.
5. **Update project** — Increments `raised_xlm` by the XLM-equivalent amount and recalculates `donor_count`.
6. **Upsert donor profile** — Computes new `total_donated_xlm` (XLM-equivalent for USDC), `projects_supported`, and badge tiers.
7. **Emit WebSocket event** — Notifies the frontend in real time via Socket.io with a `currency` field.

All database writes are wrapped in a PostgreSQL transaction (`BEGIN` / `COMMIT` / `ROLLBACK`).

### Wallet Cache

- A `Map<wallet_address, project_id>` is built from the `projects` table at startup.
- The cache is refreshed every **10 minutes** via `setInterval`.
- Only projects with `status = 'active'` are included.

### USDC Token Address Resolution

The USDC token address is resolved at startup inside `updateProjectWallets()`:

1. First, check `process.env.USDC_TOKEN_ADDRESS`.
2. If unset, attempt a Soroban RPC call to `get_usdc_token()` on the deployed contract.
3. If neither succeeds, log a warning and skip USDC indexing (non-fatal).

---

## Failure Modes

### SSE Disconnect

If the SSE connection drops, operations that occur during the disconnection may be silently lost. The SDK's internal reconnection resumes from wherever it last tracked the cursor, but if the SDK's cursor was not updated before the disconnect, those operations are skipped.

**Impact:** Missed donations with no automatic recovery.

### Duplicate Events

Horizon may deliver the same operation more than once under certain conditions (network hiccups, reconnection). The indexer handles this by checking for an existing `transaction_hash` in the database before inserting — duplicate events are silently skipped.

**Impact:** None — deduplication prevents double-counting.

### Horizon Rate Limiting

The Stellar testnet and public Horizon endpoints have rate limits. If the stream is throttled, operations may be delivered late or the connection may be reset. The SDK reconnects automatically, but any operations during the reset window may be missed.

**Impact:** Delayed or missed donation processing during high-throughput periods.

### Process Restart

The in-memory cursor is lost when the Node.js process exits. On restart, the stream begins from `"now"`, permanently missing any operations that occurred while the service was down.

**Impact:** Donations made during downtime are not recorded.

### Database Connection Failure

If the database is unreachable during `handleDonation`, the transaction rolls back and the error is logged. The operation is **not** retried or queued for later processing.

**Impact:** The donation is permanently lost.

### Exception in `onmessage`

An error in a single operation's processing is caught and logged, but the stream continues. If a `handleDonation` call fails mid-transaction, the database rolls back but the operation is not replayed.

**Impact:** That specific donation is silently dropped.

---

## Reconciliation

**There is currently no reconciliation mechanism.** The indexer has no backfill mode, no gap detection, and no periodic comparison against Horizon's latest ledger.

To recover from missed events, a reconciliation script could:

1. Query the database for the highest `ledger_attr` processed.
2. Iterate over Horizon operations from that ledger forward, filtering for payments to tracked wallets.
3. Process any unmatched transactions through the standard donation pipeline.

A future enhancement should add:

- A `indexer_state` table persisting the cursor between restarts.
- A periodic reconciliation job that detects and fills gaps.
- Prometheus-style metrics for stream health and processing lag.

---

## Health Check

The status is exposed via the `/health` endpoint:

```json
{
  "isRunning": true,
  "lastProcessedLedger": 12345678,
  "projectWalletsCount": 15,
  "usdcTokenConfigured": true,
  "usdcToXlmRate": 8.0,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Configuration

| Variable             | Default                               | Description                             |
| -------------------- | ------------------------------------- | --------------------------------------- |
| `HORIZON_URL`        | `https://horizon-testnet.stellar.org` | Horizon server endpoint                 |
| `DATABASE_URL`       | —                                     | PostgreSQL connection string            |
| `USDC_TOKEN_ADDRESS` | —                                     | Stellar address of the USDC token (required for USDC indexing) |
| `USDC_TO_XLM_RATE`   | `8.0`                                 | Conversion rate: 1 USDC = N XLM (used for raised_xlm & CO₂) |
| Wallet cache refresh | 10 minutes                            | Interval for refreshing project wallets |

---

## Code Reference

| File                                     | Purpose                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `backend/src/services/indexerService.js` | Core indexer — SSE stream, payment processing, USDC detection, deduplication, DB writes, WebSocket emission |
| `backend/src/services/stellar.js`        | Exports the `Horizon.Server` instance and `getOnChainUsdcToken()` used by the indexer       |
| `backend/src/server.js`                  | Calls `startIndexer(io)` during server boot                                                 |
| `backend/src/routes/health.js`           | Exposes `getStatus()` in the `/health` response                                             |
| `backend/src/services/store.js`          | `computeBadges()` used to assign donor tiers                                                |
| `backend/src/db/pool.js`                 | PostgreSQL connection pool                                                                  |
