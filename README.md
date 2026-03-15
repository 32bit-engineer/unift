# UniFT — Personal Command Centre for Self-Hosters

**UniFT** is a unified file transfer and media streaming platform built for self-hosters. Browse, transfer, and stream files across your remote servers from a single, unified interface. No more juggling between cloud services—take full control of your data with a tool that respects power users.

## What is UniFT?

UniFT is your personal command centre for server management. Whether you're managing multiple remote servers, NAS devices, or self-hosted storage, UniFT provides:

- **Dense, keyboard-first UI** — See 40 files, watch uploads at 80 MB/s, and stream media simultaneously without modal clutter
- **File Management** — Browse, upload, download, delete, rename, and create directories on remote servers via SSH/SFTP
- **Resumable Uploads** — Chunk-based upload with automatic resume capability for large files
- **Media Streaming** — Built-in media player with HLS stream support and FFmpeg transcoding
- **Session Management** — Persistent SSH sessions with automatic cleanup and TTL-based expiration
- **Real-time Progress Tracking** — Monitor all file transfers and streaming operations in real time
- **JWT Authentication** — Secure access with token-based authentication and refresh token rotation
- **User Management** — Role-based access control with admin permissions for multi-user deployments

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose installed
- PostgreSQL database (local or cloud-hosted)
- Kafka instance (optional for now, required for future features)

### Self-Host in 3 Steps

#### 1. Create a `.env` file

```bash
# Database (PostgreSQL required)
DB_URL=jdbc:postgresql://your-postgres-host:5432/unift_db
DB_USERNAME=postgres
DB_PASSWORD=your-secure-password

# JWT Secret (generate with: openssl rand -base64 64)
JWT_SECRET=$(openssl rand -base64 64)

# Kafka (optional, required for future features)
KAFKA_BOOTSTRAP_SERVERS=your-kafka-host:9092

# API Configuration
API_PORT=8080
API_BASE_URL=http://localhost:8080/api
```

#### 2. Run Docker Compose

```yaml
version: '3.8'

services:
  unift:
    image: unift:latest
    ports:
      - "8080:8080"
    environment:
      - SPRING_DATASOURCE_URL=${DB_URL}
      - SPRING_DATASOURCE_USERNAME=${DB_USERNAME}
      - SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - SPRING_KAFKA_BOOTSTRAP_SERVERS=${KAFKA_BOOTSTRAP_SERVERS}
    volumes:
      - ./config:/app/config
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 10s
      timeout: 5s
      retries: 3
```

Then start the service:

```bash
docker-compose up -d
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

- **Built-in player** — Watch videos directly from your remote servers
- **HLS support** — Stream long-form content without full download
- **Real-time transcoding** — FFmpeg integration for format conversion
- **Progress tracking** — Resume playback from last known position

### Transfer History

- Monitor all active and completed transfers
- View detailed progress information
- Resume failed uploads
- Search and filter transfer logs

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

UniFT is built as a unified **Docker image** containing both backend and frontend:

- **Backend**: Java 24 + Spring Boot 4 (REST API, SSH/SFTP session management)
- **Frontend**: React 19 + TypeScript + Tailwind CSS (UI, media player)
- **Database**: PostgreSQL (users, sessions, transfer logs)
- **Transport**: SSH/SFTP for remote server connections

The frontend is served as static assets from the backend, so a single `docker run` command gives you the complete application.

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

- [ ] Multi-protocol support (FTP, S3, Azure Blob, GCS)
- [ ] Advanced permission management (ACLs, role-based access)
- [ ] Scheduled backups and sync jobs
- [ ] Email notifications for failed transfers
- [ ] Mobile app (native iOS/Android)
- [ ] Desktop app (Electron)

## License

[Your License Here]

## Support

For issues, feature requests, or contributions:
- **GitHub Issues**: https://github.com/32bit-engineer/unift/issues
- **Discussions**: https://github.com/32bit-engineer/unift/discussions

## Credits

Built with ❤️ for self-hosters, power users, and everyone who wants to take control of their data.
