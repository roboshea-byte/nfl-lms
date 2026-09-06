CREATE TABLE IF NOT EXISTS settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rounds (
  n int PRIMARY KEY,
  start_week int NOT NULL,
  end_week int,
  winner_ids jsonb
);
CREATE TABLE IF NOT EXISTS entries (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  label text DEFAULT '',
  email text DEFAULT '',
  paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS rollover_payments jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS round_n int NOT NULL DEFAULT 1 REFERENCES rounds(n);
CREATE TABLE IF NOT EXISTS picks (
  entry_id text REFERENCES entries(id) ON DELETE CASCADE,
  week int NOT NULL,
  team text NOT NULL,
  made_at timestamptz DEFAULT now(),
  PRIMARY KEY (entry_id, week)
);
CREATE TABLE IF NOT EXISTS results (
  game_id text PRIMARY KEY,
  hs int,
  as_ int,
  final boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO settings(id, data) VALUES (1, '{"fee":20,"tieRule":"loss","wipeoutResetTeams":true,"missedPick":"eliminate","title":"Last Man Standing","announcement":"","announcementEnabled":false,"announcementType":"update"}') ON CONFLICT (id) DO NOTHING;
INSERT INTO rounds(n, start_week) SELECT 1, 1 WHERE NOT EXISTS (SELECT 1 FROM rounds) ON CONFLICT (n) DO NOTHING;

CREATE TABLE IF NOT EXISTS accounts (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
 disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS account_id text REFERENCES accounts(id);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS account_resets (
 token_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_limits (key text PRIMARY KEY, hits int NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
 id text PRIMARY KEY, actor_id text, action text NOT NULL, target_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_round_status (
 account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 round_n int NOT NULL REFERENCES rounds(n) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('not_participating')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,round_n)
);
