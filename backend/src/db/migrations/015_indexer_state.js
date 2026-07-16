"use strict";

/**
 * 015_indexer_state.js
 *
 * Creates the `indexer_state` table for persisting Soroban RPC event cursors
 * across process restarts, and the `soroban_event_dlq` dead-letter queue for
 * events that fail processing after retries.
 *
 * The `indexer_state` table uses a simple key-value pattern so it can store
 * multiple named cursors (soroban_events, horizon_operations, etc.) in a
 * single table without schema changes.
 */

module.exports = {
  name: "015_indexer_state",

  async up(client) {
    // ── Cursor persistence ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS indexer_state (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Seed the Soroban events cursor so the service always has a row to UPDATE.
    await client.query(`
      INSERT INTO indexer_state (key, value)
      VALUES ('soroban_event_cursor', '')
      ON CONFLICT (key) DO NOTHING
    `);

    // ── Soroban event dead-letter queue ─────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS soroban_event_dlq (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type    TEXT NOT NULL,
        contract_id   TEXT NOT NULL,
        event_data    JSONB NOT NULL,
        error_message TEXT,
        error_stack   TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_soroban_event_dlq_type
      ON soroban_event_dlq(event_type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_soroban_event_dlq_created
      ON soroban_event_dlq(created_at)
    `);
  },

  async down(client) {
    await client.query(`DROP TABLE IF EXISTS soroban_event_dlq`);
    await client.query(`DROP TABLE IF EXISTS indexer_state`);
  },
};
