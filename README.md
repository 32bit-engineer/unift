# UniFT — Personal Command Centre for Self-Hosters

**UniFT** is a unified file transfer and media streaming platform built for self-hosters. Browse, transfer, and stream files across your remote servers from a single, unified interface. No more juggling between cloud services—take full control of your data with a tool that respects power users.

## What is UniFT?

UniFT is your personal command centre for server management. Whether you're managing multiple remote servers, NAS devices, or self-hosted storage, UniFT provides:

- **Dense, keyboard-first UI** — Browse files, run a terminal, and stream media from the same screen without modal clutter
- **File Management** — Browse, upload, download, delete, rename, and create directories on remote servers via SSH/SFTP
- **Media Streaming** — Stream video and audio files from any connected SSH server directly in the browser
- **Browser Terminal** — Full PTY shell over WebSocket with resize, copy/paste, and auto-reconnect
- **Session Management** — Persistent SSH sessions with automatic cleanup and TTL-based expiration
- **In-memory Transfer Progress** — Track active file transfer progress in real time for the duration of a session
- **JWT Authentication** — Secure access with short-lived access tokens and rotating refresh tokens
- **User Management** — Role-based access control with admin permissions for multi-user deployments

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed  
- PostgreSQL database (local or cloud-hosted)  
- A copy of `.env` — see `.env.example` at the repo root for all required variables

### Self-Host in 3 Steps

#### 1. Create a `.env` file

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
# Edit .env with your database credentials, JWT secret, and encryption key
```

Required variables:

```bash
# Database (PostgreSQL required)
DB_URL=jdbc:postgresql://your-postgres-host:5432/unift_db
DB_USERNAME=your_db_user
DB_PASSWORD=your-secure-password

# JWT Secret (generate with: openssl rand -base64 64)
JWT_SECRET=<your-generated-secret>

# AES-256-GCM key for SSH credential encryption (generate with: openssl rand -base64 32)
UNIFT_ENCRYPTION_KEY=<your-generated-key>
```

#### 2. Run Docker Compose

```bash
docker-compose up -d
```

This starts two containers:
- `unift-api` — Spring Boot backend on port 8080
- `unift-fe` — React frontend served via Nginx on port 80, proxying `/api/*` to the backend

For a single-container deployment (backend serves frontend static assets directly):

```bash
docker build -f Dockerfile -t unift:latest .
docker run -p 8080:8080 --env-file .env unift:latest
```

#### 3. Access UniFT

- **Web UI**: http://localhost:8080
- **API Docs**: http://localhost:8080/swagger-ui.html
- **Health Check**: http://localhost:8080/actuator/health

### Initial Setup

1. Register a new account at `http://localhost:8080/?page=login`
2. Create a remote connection by providing SSH credentials (host, port, username, password/key)
3. Start browsing, uploading, downloading, and streaming files

## Core Features

### Session-Based SSH Connections

Connect to any remote server via SSH and maintain a persistent session. Sessions are automatically managed and expire after configurable TTL (default: 30 minutes).

**Session Workflow:**
1. Authenticate with JWT token
2. Create a remote session with SSH credentials
3. Use the session ID for all subsequent file operations
4. Sessions auto-renew on activity or manually close when done

### File Management

- **List directories** — Browse remote filesystem with metadata (size, permissions, modification time)
- **Download files** — Stream download directly without server buffering
- **Upload files** — Chunked upload with automatic resume on network interruption
- **Delete files/folders** — Remove files and empty directories
- **Rename/Move** — Rename files or move them to different directories
- **Create directories** — Create new folders on remote servers

### Media Streaming

- **Direct stream** — Stream video and audio files from any connected SSH server to the browser via a dedicated range-request endpoint
- **Format support** — Browser-native formats (MP4/H.264, WebM, MP3, AAC, FLAC) play without conversion
- Media player UI and HLS relay are planned for a future release (Phase 5)

### Transfer Progress

- In-memory progress tracking for all active uploads and downloads within a session
- Progress is visible for the lifetime of the transfer; persistent transfer history is planned (Phase 3)

## API Reference

All API endpoints require JWT authentication via `Authorization: Bearer <token>` header (except auth endpoints).

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT tokens |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Logout and revoke refresh token |

### Remote Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/remote/sessions` | Create a new SSH session |
| `GET` | `/api/remote/sessions` | List all active sessions |
| `GET` | `/api/remote/sessions/{sessionId}` | Get session status |
| `DELETE` | `/api/remote/sessions/{sessionId}` | Close a session |

### File Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/remote/sessions/{sessionId}/files` | List directory contents |
| `GET` | `/api/remote/sessions/{sessionId}/files/download` | Download a file (streaming) |
| `POST` | `/api/remote/sessions/{sessionId}/files/upload` | Upload a file (chunked) |
| `POST` | `/api/remote/sessions/{sessionId}/directories` | Create a directory |
| `DELETE` | `/api/remote/sessions/{sessionId}/files` | Delete a file or directory |
| `PATCH` | `/api/remote/sessions/{sessionId}/files/rename` | Rename or move a file |

### Transfer Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/remote/sessions/{sessionId}/transfers` | List all transfers for a session |
| `GET` | `/api/remote/sessions/{sessionId}/transfers/{transferId}` | Get transfer progress |

## Authentication & Security

### JWT-Based Authentication

UniFT uses JWT (JSON Web Tokens) for stateless authentication:

- **Access Token** — Short-lived (15 minutes), used for API requests
- **Refresh Token** — Long-lived (7 days), used to obtain new access tokens
- **Device Hint** — Tracks device info from User-Agent for token management

### Credentials

All SSH credentials are sent over HTTPS (in production) and never stored in plain text. Only the session token is used for API communication.

### Supported SSH Authentication

- **Password Authentication** — Standard SSH username/password
- **Public Key Authentication** — SSH key-based authentication (Ed25519, RSA)

## Configuration

### Environment Variables

```yaml
# Database
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/unift_db
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=your-password

# JWT
JWT_SECRET=your-base64-encoded-secret
JWT_ACCESS_TOKEN_EXPIRATION_MS=900000      # 15 minutes
JWT_REFRESH_TOKEN_EXPIRATION_MS=604800000  # 7 days

# Remote Sessions
UNIFT_REMOTE_SESSION_TTL_MINUTES=30
UNIFT_REMOTE_MAX_SESSIONS_PER_USER=5
UNIFT_REMOTE_REAPER_INTERVAL_MS=60000
UNIFT_REMOTE_CONNECT_TIMEOUT_MS=15000
UNIFT_REMOTE_CHANNEL_TIMEOUT_MS=10000
UNIFT_REMOTE_SLIDING_TTL=true

# Kafka (optional)
SPRING_KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Logging
LOGGING_LEVEL_ROOT=INFO
LOGGING_LEVEL_COM_WEEKEND_ARCHITECT_UNIFT=DEBUG
```

## Architecture Overview

UniFT is a two-container Docker Compose application with an optional single-container build mode:

- **Backend**: Java 24 + Spring Boot 4 (REST API, SSH/SFTP session management, WebSocket terminal)
- **Frontend**: React 19 + TypeScript + Tailwind CSS, served by Nginx
- **Database**: PostgreSQL (users, sessions, saved hosts, refresh tokens)
- **Transport**: SSH/SFTP for all remote server operations

The `docker-compose.yml` runs a separate Nginx container that proxies `/api/*` and `/api/ws/*` to the Spring Boot backend. A combined single-container build (frontend embedded in the Spring Boot JAR) is also available via the root-level `Dockerfile`.

## Development

### Building Locally

```bash
# Build the full application (backend + frontend)
docker build -t unift:dev .

# Run with local database
docker run -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/unift_db \
           -e SPRING_DATASOURCE_USERNAME=postgres \
           -e SPRING_DATASOURCE_PASSWORD=password \
           -p 8080:8080 \
           unift:dev
```

### Running Tests

```bash
# Backend tests
./gradlew test

# Frontend tests (when available)
cd unift-fe && npm run test
```

### Code Quality

```bash
# Format Java code (required before commit)
./gradlew spotlessApply

# Check formatting
./gradlew spotlessCheck
```

## Troubleshooting

### Connection Issues

**Problem**: "Could not connect to remote host"
- Verify SSH credentials (host, port, username, password/key)
- Check that the remote server is reachable
- Ensure SSH is enabled on the remote host

**Problem**: "Session expired"
- Sessions expire after the configured TTL (default: 30 minutes of inactivity)
- Create a new session to continue
- Adjust `UNIFT_REMOTE_SESSION_TTL_MINUTES` to extend TTL

### Upload/Download Failures

**Problem**: "Transfer failed after X bytes"
- Check network stability
- Verify remote server has sufficient disk space (for uploads)
- Check file permissions on the remote server
- Retry the upload—chunked uploads support automatic resume

### Database Connection

**Problem**: "Database connection refused"
- Verify PostgreSQL is running and accessible
- Check `SPRING_DATASOURCE_URL`, username, and password
- Ensure the database and tables exist (schema is auto-initialized)

## Performance Tips

- **Keep sessions active** — Idle sessions expire after TTL. Regularly access your sessions to keep them alive.
- **Chunk large uploads** — The default chunk size is 5 MB. Adjust for your network conditions.
- **Monitor transfer progress** — Use the transfer API to track uploads/downloads and resume if needed.
- **Limit concurrent sessions** — Default max is 5 sessions per user. Adjust `UNIFT_REMOTE_MAX_SESSIONS_PER_USER` as needed.

## Roadmap

See [product-info/PRODUCT_ROADMAP.md](unift/product-info/PRODUCT_ROADMAP.md) for the full map. Headlines:

### v1.2.0 — Q2 2026
- [ ] Local file browser (browse files mounted on the UniFT server itself)
- [ ] My Files UI page
- [ ] Session management UI (list and revoke active tokens)
- [ ] Rate limiting (Bucket4j)

### v1.3.0 — Q3 2026
- [ ] Resumable chunked upload API (schema and DB tables are already in place)
- [ ] Persistent transfer history to `transfer_log`
- [ ] SSE upload progress events
- [ ] QR code mobile pairing for phone-to-server uploads

### v1.4.0 — Q3 2026
- [ ] Media player UI (Video.js + hls.js)
- [ ] FFmpeg on-demand transcoding for unsupported formats
- [ ] HLS live stream relay

### v2.0.0 — Q4 2026
- [ ] Admin panel and per-folder ACL
- [ ] Multi-protocol support (FTP/FTPS, Amazon S3, Azure Blob, GCS, SMB)
- [ ] Multi-arch Docker image (ARM64 + x86\_64)
- [ ] Password reset and email verification

---

Protocol connector stubs (credential model exists in DB) for FTP, S3, Azure Blob, and GCS are already in the codebase and will be filled in during Phase 7.

## License

Apache License 2.0 — see [LICENSE](unift/LICENSE).

## Support

For issues, feature requests, or contributions:
- **GitHub Issues**: https://github.com/32bit-engineer/unift/issues
- **Discussions**: https://github.com/32bit-engineer/unift/discussions

## Credits

Built for self-hosters, power users, and anyone who wants a direct window into their own infrastructure.
