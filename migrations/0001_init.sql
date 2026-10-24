-- 择校圣殿 · D1 数据库结构（Cloudflare D1 / SQLite）
-- 分两张表族：账号类（users/sessions/login_attempts）与业务类（schools/scores/exams/...）

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  ip         TEXT,
  ok         INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_email ON login_attempts(email, created_at);

CREATE TABLE IF NOT EXISTS schools (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  code     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL UNIQUE,
  province TEXT NOT NULL,
  city     TEXT NOT NULL,
  category TEXT NOT NULL,
  tier     TEXT NOT NULL,
  level    TEXT NOT NULL,
  note     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_schools_tier ON schools(tier, level);
CREATE INDEX IF NOT EXISTS idx_schools_province ON schools(province);

CREATE TABLE IF NOT EXISTS control_lines (
  province TEXT NOT NULL,
  year     INTEGER NOT NULL,
  subject  TEXT NOT NULL,
  batch    TEXT NOT NULL,
  score    INTEGER NOT NULL,
  PRIMARY KEY (province, year, subject, batch)
);

CREATE TABLE IF NOT EXISTS admission_scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id    INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  province     TEXT NOT NULL,
  year         INTEGER NOT NULL,
  subject      TEXT NOT NULL,
  batch        TEXT NOT NULL,
  min_score    INTEGER NOT NULL,
  avg_score    INTEGER,
  min_rank     INTEGER,
  plan_count   INTEGER,
  control_line INTEGER,
  UNIQUE (school_id, province, year, subject, batch)
);
CREATE INDEX IF NOT EXISTS idx_scores_lookup ON admission_scores(province, year, subject, batch, min_score);
CREATE INDEX IF NOT EXISTS idx_scores_school ON admission_scores(school_id, province, subject, year);

CREATE TABLE IF NOT EXISTS major_scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  province   TEXT NOT NULL,
  year       INTEGER NOT NULL,
  subject    TEXT NOT NULL,
  batch      TEXT NOT NULL,
  major      TEXT NOT NULL,
  min_score  INTEGER NOT NULL,
  min_rank   INTEGER,
  plan_count INTEGER,
  UNIQUE (school_id, province, year, subject, major)
);
CREATE INDEX IF NOT EXISTS idx_majors_school ON major_scores(school_id, province, year, subject);

CREATE TABLE IF NOT EXISTS exams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  exam_date  TEXT NOT NULL,
  total      INTEGER NOT NULL,
  full_total INTEGER NOT NULL DEFAULT 750,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_exams_user ON exams(user_id, exam_date);

CREATE TABLE IF NOT EXISTS exam_subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  score      REAL NOT NULL,
  full_score REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, school_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, id);
