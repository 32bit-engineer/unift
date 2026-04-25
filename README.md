# UniFT

**One browser tab for every server you manage.**

SSH terminal · file browser · remote editor · Docker · Kubernetes — self-hosted inside your own network, zero telemetry, nothing leaves your infrastructure.

---

## Why does this exist?

Anyone who manages remote servers is running 4–7 disconnected tools simultaneously:

| Tool | What it does |
|------|-------------|
| iTerm / Alacritty | SSH terminal |
| Filezilla / Cyberduck | SFTP file transfer |
| VS Code Remote / nano | Remote file editing |
| Portainer / Lens | Container and cluster dashboards |
| htop + custom scripts | Server health monitoring |

Every context switch costs time and mental overhead. **UniFT replaces all of them with a single browser tab.**

It runs entirely in your browser, is self-hosted on your own infrastructure in three commands, and stores credentials encrypted at rest — never in a third-party SaaS.

---

## What's in it

### SSH & Terminal
- Full PTY shell over WebSocket — real resize, copy/paste, scroll buffer
- Auto-reconnect on network drops
- Multiple concurrent sessions with per-session tab switching
- Session analytics: per-session CPU, memory, disk I/O, and network sparklines in real time

### File Browser
- Navigate the remote filesystem like a local one
- Upload with chunked multipart (large files, progress tracked)
- Download with streaming (no memory spike on the server)
- Rename, delete, create directories — inline
- Edit remote files directly in a Monaco editor embedded in the browser

### Docker Management
- Container list with live status, image, ports, and uptime
- Start, stop, restart, and remove containers
- Full per-container log viewer with search, tail control, and live streaming
- Image manager — pull, list, remove
- Network and volume management with create/remove actions
- Monitoring dashboard with per-container CPU and memory

### Kubernetes
- Cluster overview — node health, pod count, resource totals
- Pod list, deployments, services, nodes, config maps, daemonsets, statefulsets
- Per-pod and per-deployment drill-down views
- Log and event explorer

### Transfer History
- Paginated log of every upload and download across all sessions
- Search by session ID, username, filename, and status
- Shows direction, file size, transfer speed, and duration

### Auth & Security
- JWT access tokens (15 min) with silently rotating refresh tokens (7 days)
- SSH credentials encrypted at rest with AES-256-GCM
- Per-user session limits and inactivity TTL
- Strict host key checking support

---

## Quick start

**1. Generate secrets:**

```bash
cat > .env << 'EOF'
DB_URL=jdbc:postgresql://postgres:5432/unift
DB_USERNAME=unift
DB_PASSWORD=change-me

JWT_SECRET=
UNIFT_ENCRYPTION_KEY=
EOF

# Fill in the generated secrets:
sed -i '' "s|JWT_SECRET=|JWT_SECRET=$(openssl rand -base64 64)|" .env
sed -i '' "s|UNIFT_ENCRYPTION_KEY=|UNIFT_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
```

**2. Create a `docker-compose.yml`:**

```yaml
services:

  redis:
    image: redis:7-alpine
    container_name: unift-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  postgres:
    image: postgres:16-alpine
    container_name: unift-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: unift
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  unift-api:
    image: ghcr.io/32bit-engineer/unift/unift-api:latest
    container_name: unift-api
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "${API_PORT:-8080}:8080"
    volumes:
      - ${STORAGE_PATH:-./storage}:/mnt/storage:rw
    environment:
      DB_URL: ${DB_URL}
      DB_USERNAME: ${DB_USERNAME}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      JWT_ACCESS_TOKEN_EXPIRATION_MS: ${JWT_ACCESS_TOKEN_EXPIRATION_MS:-900000}
      JWT_REFRESH_TOKEN_EXPIRATION_MS: ${JWT_REFRESH_TOKEN_EXPIRATION_MS:-604800000}
      UNIFT_ENCRYPTION_KEY: ${UNIFT_ENCRYPTION_KEY}
      UNIFT_CORS_ALLOWED_ORIGINS: ${UNIFT_CORS_ALLOWED_ORIGINS:-http://localhost}
      UNIFT_TERMINAL_ALLOWED_ORIGINS: ${UNIFT_TERMINAL_ALLOWED_ORIGINS:-http://localhost}
      REDIS_HOST: redis
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}
      LOG_LEVEL_ROOT: ${LOG_LEVEL_ROOT:-INFO}
      UNIFT_SESSION_TTL_MINUTES: ${UNIFT_SESSION_TTL_MINUTES:-30}
      UNIFT_MAX_SESSIONS_PER_USER: ${UNIFT_MAX_SESSIONS_PER_USER:-5}

  unift-fe:
    image: ghcr.io/32bit-engineer/unift/unift-fe:latest
    container_name: unift-fe
    restart: unless-stopped
    depends_on:
      - unift-api
    ports:
      - "${APP_PORT:-80}:80"

volumes:
  redis-data:
  postgres-data:
```

**3. Start:**

```bash
docker compose up -d
```

Open [http://localhost](http://localhost), register an account, and add your first SSH host.

> **Production note:** Run behind a reverse proxy (nginx, Caddy, Traefik) with TLS. The UI will warn if HTTPS is not detected.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_URL` | ✅ | — | PostgreSQL JDBC URL, e.g. `jdbc:postgresql://postgres:5432/unift` |
| `DB_USERNAME` | ✅ | — | Database user |
| `DB_PASSWORD` | ✅ | — | Database password |
| `JWT_SECRET` | ✅ | — | Base64 secret for signing JWTs. `openssl rand -base64 64` |
| `UNIFT_ENCRYPTION_KEY` | ✅ | — | AES-256-GCM key for credential encryption. `openssl rand -base64 32` |
| `API_PORT` | | `8080` | Host port for the backend API |
| `APP_PORT` | | `80` | Host port for the frontend |
| `STORAGE_PATH` | | `./storage` | Host path mounted into the API container for file storage |
| `UNIFT_SESSION_TTL_MINUTES` | | `30` | Inactivity minutes before an SSH session is reaped |
| `UNIFT_MAX_SESSIONS_PER_USER` | | `5` | Maximum concurrent SSH sessions per user |
| `UNIFT_CORS_ALLOWED_ORIGINS` | | `http://localhost` | Comma-separated allowed CORS origins |
| `UNIFT_TERMINAL_ALLOWED_ORIGINS` | | `http://localhost` | Comma-separated allowed WebSocket origins |
| `JWT_ACCESS_TOKEN_EXPIRATION_MS` | | `900000` | Access token lifetime (ms) — 15 min default |
| `JWT_REFRESH_TOKEN_EXPIRATION_MS` | | `604800000` | Refresh token lifetime (ms) — 7 days default |
| `KAFKA_BOOTSTRAP_SERVERS` | | `localhost:9092` | Kafka broker (optional — wired but not required for core features) |
| `LOG_LEVEL_ROOT` | | `INFO` | Root log level: `DEBUG`, `INFO`, `WARN`, `ERROR` |

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 4, Java 21 |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Database | PostgreSQL 16 |
| Cache / pub-sub | Redis 7 |
| Terminal | xterm.js over WebSocket (SockJS + STOMP) |
| Code editor | Monaco Editor |
| Auth | JWT (jjwt), AES-256-GCM credential encryption |
| Container | Docker, Docker Compose |

---

## Building from source

```bash
# Backend
cd unift
./gradlew bootJar

# Frontend
cd unift-fe
npm install
npm run build
```

Or build both images:

```bash
docker compose build
```

---

## License

Apache License 2.0 — see [LICENSE](unift/LICENSE).

---

## Contributing

Issues and pull requests are welcome. If you're reporting a bug, include your Docker Compose version, browser, and the browser console output. If you're proposing a feature, open an issue first to discuss scope before sending a PR.
