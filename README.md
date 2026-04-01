# UniFT — Unified Remote Infrastructure Workspace

**UniFT** is a browser-based, self-hostable remote infrastructure workspace. Connect to your servers over SSH, browse and manage files, edit configs, and run a full terminal — all from a single browser tab. Nothing leaves your network.

> "The single browser tab where engineers connect to any server, browse any storage, and manage any cluster — self-hosted, nothing leaves your network."

## What is UniFT?

DevOps engineers, backend developers, and sysadmins manage remote servers using 4–7 disconnected tools — a terminal emulator, an SFTP client, a code editor, a dashboard. Every context switch costs time and focus. UniFT replaces all of them with a single, unified workspace.

### Current Capabilities

- **SSH Connection Management** — Store connection profiles (host, port, user, auth method), establish sessions, and manage their lifecycle
- **File Browser** — Navigate the remote filesystem over SFTP with metadata (size, permissions, modification time), create folders, rename, and delete
- **File Editor** — Open and edit remote files in the browser with syntax highlighting for JS/TS, Python, Bash, YAML, JSON, Dockerfiles, and more
- **Browser Terminal** — Full PTY shell over WebSocket with resize support, copy/paste, and automatic reconnect
- **File Upload / Download** — Chunked upload and direct streaming download over SFTP with real-time transfer progress tracking
- **JWT Authentication** — Short-lived access tokens (15 min) with rotating refresh tokens (7 days)

### In Progress (Phase 0 completion)

- Host key verification UI (TOFU flow with fingerprint confirmation)
- Credential encryption at rest (AES-256-GCM)
- Basic audit log (server-side)
- Connection state machine with all 7 states visible in the UI

### What Is NOT in Scope

- Media streaming (different product, different legal risk — not part of the infrastructure workspace vision)
- VPN or network mesh (integrate Tailscale or ZeroTier instead)
- Full cloud provider console — UniFT is cloud-agnostic, not cloud-native
- Code-only IDE — VS Code exists; UniFT is an infrastructure workspace

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
3. Start browsing files, editing configs, and running terminal commands

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

## Security

- **JWT**: Access tokens expire in 15 minutes. Refresh tokens rotate on each use and expire after 7 days.
- **SSH auth**: Password and public key authentication supported (Ed25519, RSA).
- **Credential storage**: Credential encryption at rest (AES-256-GCM) is in progress as part of Phase 0 completion.
- **Path validation**: All file paths are validated server-side. Path traversal attempts (`../`) are rejected and logged.
- **Transport**: All API and WebSocket traffic must run over HTTPS/WSS in production. The UI warns if HTTPS is not detected.
- **Rate limiting**: Planned for Phase 0 completion (login: max 5 attempts / min / IP).

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

### Phase 1 — Stickiness
- [ ] Server health dashboard (CPU / memory / disk over SSH)
- [ ] Session recording (asciicast format, opt-in)
- [ ] Multiple terminal tabs per connection
- [ ] tmux auto-attach on reconnect
- [ ] Resumable file transfers
- [ ] File transfer queue UI (pause, cancel, resume)
- [ ] Keyboard shortcut map
- [ ] Search within file tree
- [ ] Mobile-responsive layout

### Phase 2 — Teams
- [ ] User invitations and organizations
- [ ] RBAC (Owner / Admin / Editor / Viewer)
- [ ] Shared connection pools
- [ ] Audit log UI (searchable, filterable, exportable)
- [ ] Time-bound access grants
- [ ] Email notifications for connection failures and access changes

### Phase 3 — Expansion
- [ ] S3 object storage (browse, upload, download, delete)
- [ ] Docker container management (list, logs, exec, lifecycle)
- [ ] Database browser (PostgreSQL + MySQL via SSH tunnel)
- [ ] GCS and Azure Blob integration
- [ ] SSO / SAML / OIDC

### Phase 4 — Enterprise
- [ ] Kubernetes cluster management (pods, deployments, logs)
- [ ] LDAP / Active Directory integration
- [ ] Compliance report export
- [ ] On-premise enterprise installer (air-gapped)

## License

Apache License 2.0 — see [LICENSE](unift/LICENSE).

## Support

For issues, feature requests, or contributions:
- **GitHub Issues**: https://github.com/32bit-engineer/unift/issues
- **Discussions**: https://github.com/32bit-engineer/unift/discussions

## Credits

Built for DevOps engineers, backend developers, and sysadmins who want a direct, self-hosted window into their own infrastructure.
