# UniFT

One browser tab for every server you manage — SSH terminal, file browser, remote editor, Docker, and Kubernetes, self-hosted inside your own network.

If you're juggling four apps to do one job — a terminal emulator, an SFTP client, a container dashboard, and something else for files — UniFT replaces all of them. It runs entirely in your browser, stores nothing outside your own infrastructure, and takes three commands to self-host. Unlike thin web-SSH toys, this is a full workspace: edit files inline, tail logs, manage containers, browse your file system, and switch between servers — all from a single tab.

## What's in it

- **SSH + terminal** — Full PTY shell over WebSocket with resize, copy/paste, and auto-reconnect
- **File browser** — Navigate, upload (chunked), download (streaming), rename, delete, and edit remote files directly in the browser
- **Docker management** — Container list, image manager, and per-container logs and controls
- **Kubernetes** — Pod list, deployments, services, nodes, and cluster overview
- **Session analytics** — Per-session CPU, memory, disk, and network sparklines polled in real time
- **Auth** — JWT access tokens (15 min) with rotating refresh tokens (7 days), credentials encrypted at rest with AES-256-GCM

## Quick Start

**1. Generate secrets and create a `.env` file:**

```bash
cat > .env << EOF
DB_URL=jdbc:postgresql://postgres:5432/unift
DB_USERNAME=unift
DB_PASSWORD=change-me
JWT_SECRET=$(openssl rand -base64 64)
UNIFT_ENCRYPTION_KEY=$(openssl rand -base64 32)
EOF
```

**2. Paste this `docker-compose.yml`:**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: unift
      POSTGRES_USER: ${DB_USERNAME}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  unift-api:
    image: ghcr.io/32bit-engineer/unift/unift-api:latest
    depends_on: [postgres, redis]
    ports:
      - "${API_PORT:-8080}:8080"
    environment:
      DB_URL: ${DB_URL}
      DB_USERNAME: ${DB_USERNAME}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      UNIFT_ENCRYPTION_KEY: ${UNIFT_ENCRYPTION_KEY}
      REDIS_HOST: redis

  unift-fe:
    image: ghcr.io/32bit-engineer/unift/unift-fe:latest
    depends_on: [unift-api]
    ports:
      - "${APP_PORT:-80}:80"

volumes:
  postgres-data:
  redis-data:
```

**3. Start it:**

```bash
docker compose up -d
```

Open [http://localhost](http://localhost), register an account, and add your first SSH connection.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DB_URL` | PostgreSQL JDBC connection string | — (required) |
| `DB_USERNAME` | Database user | — (required) |
| `DB_PASSWORD` | Database password | — (required) |
| `JWT_SECRET` | Base64-encoded secret for signing JWTs. Generate: `openssl rand -base64 64` | — (required) |
| `UNIFT_ENCRYPTION_KEY` | AES-256-GCM key for SSH credential encryption. Generate: `openssl rand -base64 32` | — (required) |
| `API_PORT` | Host port for the backend API | `8080` |
| `APP_PORT` | Host port for the frontend | `80` |
| `UNIFT_SESSION_TTL_MINUTES` | Minutes of inactivity before an SSH session is reaped | `30` |
| `UNIFT_MAX_SESSIONS_PER_USER` | Maximum concurrent SSH sessions per user | `5` |
| `UNIFT_CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost` |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker address (optional — event bus, not required for core features) | `localhost:9092` |
| `LOG_LEVEL_ROOT` | Root log level (`DEBUG`, `INFO`, `WARN`, `ERROR`) | `INFO` |

> Run behind a reverse proxy with TLS in production. The UI will warn you if HTTPS is not detected.

## License

Apache License 2.0 — see [LICENSE](unift/LICENSE).
