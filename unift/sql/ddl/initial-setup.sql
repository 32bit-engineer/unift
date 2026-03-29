CREATE TABLE public.users (
    id uuid PRIMARY KEY,
    first_name varchar(100) NULL,
    last_name varchar(100) NULL,
    username varchar(50) NOT NULL,
    "password" varchar(255) NOT NULL,
    "role" varchar(20) DEFAULT 'USER'::character varying NOT NULL,
    email varchar(255) NULL,
    phone_number varchar(30) NULL,
    email_verified bool DEFAULT false NULL,
    email_verified_at timestamptz NULL,
    is_active bool DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    last_login_at timestamptz NULL,
    password_updated_at timestamptz NULL,
    failed_login_attempts int4 DEFAULT 0 NULL,
    locked_until timestamptz NULL,
    deleted_at timestamptz NULL,
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_username_key UNIQUE (username)
);

---

CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(255) NOT NULL UNIQUE,  -- NEVER store raw token
    device_hint  VARCHAR(255),
    issued_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ  NOT NULL,
    revoked_at   TIMESTAMPTZ  -- NULL = still valid
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

---

CREATE TABLE upload_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES users(id),
    filename         VARCHAR(512) NOT NULL,
    total_size       BIGINT       NOT NULL,
    chunk_size       INT          NOT NULL,
    total_chunks     INT          NOT NULL,
    received_chunks  INT[]        NOT NULL DEFAULT '{}',  -- PostgreSQL array
    destination_path TEXT         NOT NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '48 hours'
);

---

CREATE TABLE transfer_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         REFERENCES users(id),
    filename      VARCHAR(512) NOT NULL,
    source        VARCHAR(512),
    destination   VARCHAR(512),
    size_bytes    BIGINT,
    avg_speed_bps BIGINT,
    duration_ms   BIGINT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transfer_log_user ON transfer_log(user_id, created_at DESC);


---

CREATE TABLE otp_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id),
    token_hash VARCHAR(255) NOT NULL,
    purpose    VARCHAR(30)  NOT NULL,  -- 'RESET' or 'PAIR'
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ  -- NULL = not yet used
);


CREATE TYPE auth_type_enum AS ENUM (
  'password',
  'key',
  'key_passphrase'
);

CREATE TYPE protocol_type_enum AS ENUM (
  'ssh_sftp',
  'ftp',
  's3',
  'azure_blob',
  'gcs'
);


CREATE TABLE saved_hosts (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL,          -- belongs to one user
  label       VARCHAR(100),           -- "My VPS", "Home Server"
  protocol_type  protocol_type_enum NOT NULL DEFAULT 'ssh_sftp',
  hostname    VARCHAR(255),
  port        INTEGER DEFAULT 22,
  username    VARCHAR(100),

  -- credential fields (all encrypted at rest)
  auth_type   auth_type_enum,         -- SSH-specific; NULL for non-SSH protocols
  encrypted_password   TEXT,          -- AES-256 encrypted
  encrypted_privatekey TEXT,          -- AES-256 encrypted
  encrypted_passphrase TEXT,          -- AES-256 encrypted

  created_at  TIMESTAMP,
  last_used   TIMESTAMP,

  strict_host_key_checking BOOLEAN NOT NULL DEFAULT FALSE,
  expected_fingerprint     TEXT
);

---

-- Persists a lightweight audit record for every remote session opened by a user.
-- Unlike the in-memory SessionRegistry, rows here survive server restarts and
-- session expiry, giving users a full connection history with OS/service details.

CREATE TABLE session_log (
    id          UUID          PRIMARY KEY,                    -- UUID v7 from Java (time-ordered)
    user_id     UUID          NOT NULL REFERENCES users(id),
    label       VARCHAR(200),                                 -- friendly alias from ConnectRequest
    protocol    VARCHAR(30)   NOT NULL,                       -- ProtocolType enum name (e.g. SSH_SFTP)
    host        VARCHAR(255)  NOT NULL,
    port        INTEGER       NOT NULL,
    username    VARCHAR(100),
    remote_os   VARCHAR(255),                                 -- e.g. "Ubuntu 22.04.3 LTS", "Amazon S3"
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ                                   -- NULL while the session is active
);

CREATE INDEX idx_session_log_user ON session_log (user_id, created_at DESC);

---

-- Persists every analytics probe result for a session.
-- Scalar metric columns allow efficient time-range queries and statistical aggregations.
-- The full response (including traffic history and connected-node list) is replayed from snapshot_json.

CREATE TABLE session_analytics_snapshot (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership / lookup
    session_id               UUID         NOT NULL,          -- session_log.id (no FK: session may be closed)
    user_id                  UUID         NOT NULL REFERENCES users(id),
    host                     VARCHAR(255),
    state                    VARCHAR(30),
    captured_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Session duration
    session_duration_seconds BIGINT,

    -- SSH exec latency (ms)
    latency_avg_ms           DOUBLE PRECISION,
    latency_min_ms           DOUBLE PRECISION,
    latency_max_ms           DOUBLE PRECISION,

    -- ICMP packet loss
    packet_loss_percent      DOUBLE PRECISION,
    packets_sent             INTEGER,
    packets_received         INTEGER,

    -- Throughput
    current_upload_bps       BIGINT,
    current_download_bps     BIGINT,
    total_uploaded_bytes     BIGINT,
    total_downloaded_bytes   BIGINT,

    -- Remote system metrics
    cpu_percent              DOUBLE PRECISION,
    memory_used_percent      DOUBLE PRECISION,
    memory_used_bytes        BIGINT,
    memory_total_bytes       BIGINT,
    disk_used_percent        DOUBLE PRECISION,
    disk_used_bytes          BIGINT,
    disk_total_bytes         BIGINT,

    -- Session metadata
    ssh_cipher               VARCHAR(100),
    region                   VARCHAR(100),
    remote_pid               BIGINT,

    -- Full snapshot payload (traffic history + connected nodes + all metadata)
    snapshot_json            JSONB        NOT NULL
);

-- Primary query pattern: all snapshots for a session, newest first
CREATE INDEX idx_analytics_snapshot_session  ON session_analytics_snapshot (session_id, captured_at DESC);

-- User-level history across all sessions
CREATE INDEX idx_analytics_snapshot_user     ON session_analytics_snapshot (user_id, captured_at DESC);

-- Time-based range scans
CREATE INDEX idx_analytics_snapshot_captured ON session_analytics_snapshot (captured_at DESC);

