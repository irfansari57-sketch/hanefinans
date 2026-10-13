-- 017: agent_cache — AI agent (sentiment/news/macro) yanıtları için TTL'li cache.
-- Uygula: wrangler d1 execute <DB_NAME> --remote --file=functions/migrations/017_agent_cache.sql
CREATE TABLE IF NOT EXISTS agent_cache (
  key        TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_cache_expires ON agent_cache (expires_at);
