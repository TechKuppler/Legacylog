-- ============================================================
-- LegacyLog Database Schema  (PostgreSQL)
-- Phase 1 + Phase 2 (RBAC + Departments)
-- Run: node backend/src/utils/migrate.js
-- ============================================================

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  email                VARCHAR(255) NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  role                 VARCHAR(20)  NOT NULL DEFAULT 'member',
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login           TIMESTAMPTZ  NULL,
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id         CHAR(64)    PRIMARY KEY,
  user_id    INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Departments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  color       VARCHAR(7)   NOT NULL DEFAULT '#185FA5',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  INT          NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── Experiences ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiences (
  id               SERIAL PRIMARY KEY,
  title            VARCHAR(255) NOT NULL,
  type             VARCHAR(10)  NOT NULL
                     CHECK (type IN ('audio','pdf','doc','txt')),
  original_path    VARCHAR(512) NOT NULL,
  original_name    VARCHAR(255) NOT NULL,
  file_size_bytes  BIGINT       NOT NULL,
  duration_secs    INT          NULL,
  language         VARCHAR(10)  NOT NULL DEFAULT 'en'
                     CHECK (language IN ('en','hi','gu','mixed')),
  uploaded_by      INT          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department_id    INT          NULL     REFERENCES departments(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── Transcription Jobs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id             SERIAL PRIMARY KEY,
  experience_id  INT         NOT NULL UNIQUE REFERENCES experiences(id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','processing','done','failed')),
  transcript     TEXT        NULL,
  whisper_model  VARCHAR(40) NOT NULL DEFAULT 'whisper-1',
  language_hint  VARCHAR(10) NULL,
  error_message  TEXT        NULL,
  started_at     TIMESTAMPTZ NULL,
  completed_at   TIMESTAMPTZ NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tags ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(80) NOT NULL UNIQUE,
  is_predefined BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by    INT         NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Experience–Tag Pivot ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experience_tags (
  experience_id INT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  tag_id        INT NOT NULL REFERENCES tags(id)        ON DELETE CASCADE,
  PRIMARY KEY (experience_id, tag_id)
);

-- ─── User ↔ Department Pivot ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_departments (
  user_id       INT NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  assigned_by   INT NOT NULL REFERENCES users(id),
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, department_id)
);

-- ─── Department ↔ Tag Pivot ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS department_tags (
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  tag_id        INT NOT NULL REFERENCES tags(id)        ON DELETE CASCADE,
  PRIMARY KEY (department_id, tag_id)
);

-- ─── Per-user Permissions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id              INT     NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  can_upload           BOOLEAN NOT NULL DEFAULT FALSE,
  can_record           BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_tags      BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete_own       BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_transcripts BOOLEAN NOT NULL DEFAULT TRUE,
  can_download_files   BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_chat        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by           INT     NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Predefined Tag Seeds ─────────────────────────────────────────────────────
INSERT INTO tags (name, is_predefined) VALUES
  ('Vendor Onboarding', TRUE), ('Manufacturing',  TRUE), ('Exports',    TRUE),
  ('HR',                TRUE), ('Finance',        TRUE), ('Operations', TRUE),
  ('Strategy',          TRUE), ('Client Meeting', TRUE), ('Compliance', TRUE),
  ('Training',          TRUE)
ON CONFLICT (name) DO NOTHING;

-- ─── User ↔ Tag Direct Assignment ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tags (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id      INT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  assigned_by INT NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_id)
);

-- ─── Experience Notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experience_notes (
  id            SERIAL PRIMARY KEY,
  experience_id INT         NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  user_id       INT         NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Phase 2: Safe upgrade statements for existing databases ──────────────────
-- ADD COLUMN IF NOT EXISTS is a no-op on fresh installs (already in CREATE TABLE)
ALTER TABLE users       ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ NULL;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS department_id INT NULL REFERENCES departments(id) ON DELETE SET NULL;

-- Phase 3: AssemblyAI rich transcription fields
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS assembly_id    VARCHAR(60)  NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS summary        TEXT         NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS chapters       JSONB        NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS key_phrases    JSONB        NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS entities       JSONB        NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS sentiment      JSONB        NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS confidence     FLOAT        NULL;
ALTER TABLE transcription_jobs ADD COLUMN IF NOT EXISTS audio_duration INT          NULL;

-- Phase 4: Store files in PostgreSQL (no more disk dependency)
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS file_data  BYTEA        NULL;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS mime_type  VARCHAR(120) NULL;
ALTER TABLE experiences ALTER COLUMN original_path          DROP NOT NULL;

-- Phase 3: User-tag direct assignment and notes tables (safe no-ops on fresh install)
CREATE TABLE IF NOT EXISTS user_tags (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id      INT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  assigned_by INT NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_id)
);
CREATE TABLE IF NOT EXISTS experience_notes (
  id            SERIAL PRIMARY KEY,
  experience_id INT         NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  user_id       INT         NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Update role CHECK constraint from Phase 1 values to Phase 2 values
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any existing role-check constraint (regardless of auto-generated name)
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'c' AND conname LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.conname);
  END LOOP;
  -- Migrate old role values before adding new constraint
  UPDATE users SET role = 'member' WHERE role NOT IN ('admin', 'member');
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Role constraint update: %', SQLERRM;
END
$$;
