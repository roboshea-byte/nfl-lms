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
INSERT INTO settings(id, data) VALUES (1, '{"fee":20,"tieRule":"loss","wipeoutResetTeams":false,"missedPick":"eliminate","title":"Last Man Standing"}') ON CONFLICT (id) DO NOTHING;
INSERT INTO rounds(n, start_week) SELECT 1, 1 WHERE NOT EXISTS (SELECT 1 FROM rounds) ON CONFLICT (n) DO NOTHING;
