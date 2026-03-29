# Product Engineering Reference
## Unified Remote Infrastructure Workspace

> **This document is the source of truth for all product, engineering, and design decisions.**
> Read it before scoping a feature. Update it when something changes.

---

## Table of Contents

1. [What & Why](#1-what--why)
2. [Design System & UI Language](#2-design-system--ui-language)
3. [Security & Compliance](#3-security--compliance)
4. [Dos and Don'ts](#4-dos-and-donts)
5. [Feature Specifications & Intricacies](#5-feature-specifications--intricacies)
6. [Technical Architecture Rules](#6-technical-architecture-rules)
7. [Rules & Regulations](#7-rules--regulations)
8. [Phase-by-Phase Roadmap](#8-phase-by-phase-roadmap)
9. [Decisions Log](#9-decisions-log)

---

## 1. What & Why

### The Problem

DevOps engineers, backend developers, and sysadmins manage remote servers, cloud storage, and clusters using 4–7 different disconnected tools — a terminal emulator, an SFTP client, a code editor, a K8s dashboard, an S3 browser. Every context switch costs cognitive load and time. There is no unified, browser-native, self-hostable product that handles all of this in one workspace.

### What We Are Building

A **browser-based, self-hostable remote infrastructure workspace** that lets users:
- Connect to remote VMs over SSH with full terminal access
- Browse, edit, upload, and download files on remote servers
- Manage cloud object storage (S3, GCS, Azure Blob, SMB)
- Monitor server health in real time
- Manage containers and clusters (future)
- Collaborate with teams on shared infrastructure (future)

### What We Are NOT Building

- A VPN or mesh network (integrate with Tailscale/ZeroTier instead)
- A media streaming service (different product, different risk)
- A full cloud provider console (we are cloud-agnostic, not cloud-native)
- A code-only IDE (VS Code exists; we are an infrastructure workspace)

### The North Star Statement

> "The single browser tab where engineers connect to any server, browse any storage, and manage any cluster — self-hosted, nothing leaves your network."

### Who We Are Building For

| Persona | Core need | How we serve them |
|---|---|---|
| Solo developer | Manage 1–5 personal VMs without installing desktop apps | Clean, fast, zero-install workspace |
| Small DevOps team | Shared server access with audit trail | Team connections, RBAC, session logs |
| Security-conscious org | Everything inside their own network, fully auditable | Self-hosted, encryption at rest, SSO, audit export |
| Freelancer/contractor | Temporary access to client infra | Time-bound access grants |

---

## 2. Design System & UI Language

### Palette

```
Background:    #0C0C14  (near-black, slightly blue)
Surface-1:     #13131E  (card/panel base)
Surface-2:     #1A1A28  (hover states)
Surface-3:     #222234  (active/selected)
Border:        rgba(255,255,255,0.07)  (default)
Border-hover:  rgba(255,255,255,0.12)

Accent:        #7C6DFA  (primary — violet, not harsh purple)
Accent-dim:    rgba(124,109,250,0.12)
Teal:          #3DD6BF  (success/online status)
Coral:         #FF6B7A  (error/danger)
Amber:         #F5A623  (warning/idle)
Green:         #4ADE80  (healthy/online)

Text-1:        #EEEEF8  (primary text)
Text-2:        #9090B0  (secondary/labels)
Text-3:        #52526A  (muted/hints)

Code font:     DM Mono
UI font:       DM Sans
```

### Design Principles

1. **Not a terminal, not a file manager.** The UI must feel like a modern SaaS product. No CRT nostalgia, no Windows Explorer aesthetics. Think: Railway, Linear, Vercel dashboard.

2. **Color means something.** Accent (violet) = interactive/selected. Teal = connected/healthy. Amber = idle/warning. Coral = error. Green = online. Never use color decoratively.

3. **Typography hierarchy is everything.** Three text sizes only: 13px body, 12px secondary, 11px meta/label. Two weights: 400 regular, 500/600 medium. Mono only for: code, hostnames, file paths, command output.

4. **Borders are whispers, not walls.** Use `rgba(255,255,255,0.07)` — barely there. Only increase opacity on hover or focus.

5. **Status is always visible.** Connection status (online/idle/offline) must be scannable at a glance from the dashboard. Never require a user to open a panel to find out if a server is reachable.

6. **Density is a feature.** Engineers want to see a lot of information. Don't waste vertical space. A file tree item is 28–32px tall, not 48px.

### Layout Rules

- Sidebar nav: 56px wide, icon-only. Tooltip on hover.
- File tree panel: 220px wide, collapsible.
- Right info panel: 220px wide, collapsible.
- Terminal pane: min 160px, max 60% of viewport, resizable by drag.
- Editor line height: 20px. Font size: 12px mono.
- All panels must survive at 1280px viewport width.

---

## 3. Security & Compliance

> **This section is non-negotiable. No feature ships without satisfying its relevant security requirements.**

### Credential Security

| Rule | Detail |
|---|---|
| Never store plain-text credentials | Encrypt all passwords and private keys at rest using AES-256-GCM |
| Key storage | Private keys: stored encrypted with a per-installation master key. The master key is derived from a passphrase or stored in OS keychain. |
| Environment isolation | Credentials for one connection must be physically separate from another. No shared in-memory pools. |
| No credential logging | Filter all logs. Regex-strip anything matching private key blocks, password fields, and env var values from all log outputs. |
| Credential rotation | Provide UI to rotate/update credentials without deleting the connection. Never show the raw private key after initial upload — write-only after save. |

### Transport Security

- All WebSocket connections: WSS (TLS) only in production. Never WS.
- Self-hosted installs: Ship with a TLS config guide. Warn clearly in UI if running without HTTPS.
- SSH connections: Only accept known host keys after explicit user confirmation. Never auto-accept. Log TOFU (Trust On First Use) decisions with timestamp.
- Do not forward SSH agent by default. Make it opt-in with a clear warning.

### Session Security

| Rule | Detail |
|---|---|
| Session timeout | Idle sessions disconnect after configurable timeout (default: 30 min). |
| Session token rotation | Rotate JWT/session tokens after each use (sliding window). |
| CSRF protection | All state-mutating API endpoints require CSRF token. |
| Rate limiting | Login endpoints: max 5 attempts / minute / IP. Connection creation: max 20 / hour / user. |
| Re-authentication | Require password re-entry before: viewing credential details, granting team access, deleting a connection. |

### File Transfer Security

- Validate file paths server-side. Never trust client-provided paths. Canonicalize before use.
- Reject path traversal attempts (`../` patterns). Log them as security events.
- For downloads: stream directly from SSH to browser. Never write to server disk first.
- File size limits: No hard cap (streaming), but warn at >2GB. Chunk transfers to prevent memory exhaustion.
- MIME type: Never rely on client-declared MIME type for any server-side processing.

### Multi-tenancy / Team Security

- All database queries must be scoped to `tenant_id`. No global queries on connection or session tables.
- User A must never be able to enumerate, access, or affect User B's connections.
- Team invitations: expire in 72 hours. Single-use tokens.
- Access grants: log creation, modification, and deletion with full actor identity.

### Audit Logging Requirements

Every event must log:
```
{
  timestamp: ISO8601,
  actor_id: user UUID,
  actor_ip: string,
  connection_id: UUID,
  action: enum(CONNECT, DISCONNECT, FILE_READ, FILE_WRITE, FILE_DELETE,
                FILE_DOWNLOAD, FILE_UPLOAD, TERMINAL_SESSION_START,
                TERMINAL_SESSION_END, CREDENTIAL_UPDATE, ACCESS_GRANTED,
                ACCESS_REVOKED, LOGIN, LOGOUT, LOGIN_FAILED),
  target: string (file path, hostname, user email),
  result: enum(SUCCESS, FAILURE),
  metadata: {}
}
```

- Logs are append-only. No update or delete on log records.
- Logs must be exportable as JSON or CSV.
- Retention policy configurable: 30/60/90/365 days.

### Self-Hosted Security Checklist (ship with docs)

- [ ] TLS certificate configured
- [ ] Default admin password changed on first launch
- [ ] Database not exposed to public network
- [ ] Firewall: only ports 80/443 and SSH (22) open
- [ ] Backup encryption enabled
- [ ] Log rotation configured
- [ ] Rate limiting enabled

---

## 4. Dos and Don'ts

### Dos

- **Do** design every feature for teams first, solo use second. Solo is the free tier; teams are the business.
- **Do** make the product usable without documentation. Every action must be discoverable.
- **Do** fail loudly and clearly. If a connection drops mid-transfer, tell the user exactly what happened and what they can do.
- **Do** make every destructive action (delete, disconnect, wipe) require confirmation and be reversible where possible.
- **Do** design for slow / unreliable networks. Connection drops happen. The app must handle reconnection gracefully.
- **Do** keep the file editor simple. This is not VS Code. Syntax highlighting + save + basic find/replace is the scope.
- **Do** build observable systems. Every background process (transfer, session heartbeat, log collection) must have a visible status.
- **Do** write E2E tests for every critical user flow: connect → browse → edit → save → disconnect.
- **Do** provide a CLI tool for power users who want to script connection management.
- **Do** version your API from day one (`/api/v1/...`).

### Don'ts

- **Don't** cache credentials in the browser (localStorage, sessionStorage, IndexedDB). Credentials live on the server, period.
- **Don't** trust the client for any permission check. All authorization happens server-side.
- **Don't** block the main thread with file I/O. All transfers and SSH I/O must be async/streamed.
- **Don't** add a feature because it's technically interesting. Add it because users asked for it or it closes a sale.
- **Don't** show raw stack traces or internal error details to end users. Log them server-side, show friendly messages client-side.
- **Don't** auto-reconnect to failed connections without user intent. Show the error, let the user reconnect deliberately.
- **Don't** build multi-protocol support (S3, GCS, etc.) until SSH/SFTP is truly stable.
- **Don't** use regex to parse SSH command output for business logic. It will break. Use structured APIs where they exist.
- **Don't** silently ignore permission errors on the remote. Surface them clearly: "Permission denied: /etc/nginx/nginx.conf (you need sudo)".
- **Don't** use `eval()` or dynamic code execution anywhere, ever.
- **Don't** depend on the remote server having any specific software installed beyond OpenSSH.

---

## 5. Feature Specifications & Intricacies

### 5.1 Connection Management

**What it does:** Stores connection profiles (host, port, user, auth method, key/password), manages SSH session lifecycle, and exposes active connections to the workspace.

**Data model:**
```
Connection {
  id: UUID
  user_id: UUID
  name: string
  host: string
  port: integer (default: 22)
  username: string
  auth_type: enum(PASSWORD, KEY, KEY_WITH_PASSPHRASE)
  credential_ref: UUID → encrypted_credentials table
  tags: string[]
  created_at: timestamp
  last_connected_at: timestamp
  is_favorite: boolean
}
```

**Known issues & things to be aware of:**

- **Host key changes:** If a server's host key changes (e.g., after a rebuild), the connection will fail. Store accepted host keys per connection. Alert the user with the specific fingerprint mismatch — this is a security event, not just an error.

- **Zombie sessions:** SSH connections can appear alive while being silently dead (network timeout, server reboot). Implement a heartbeat: send a null SSH packet every 30 seconds. If no response in 10 seconds, mark session as stale and notify the user.

- **Key file formats:** Support RSA, ECDSA, Ed25519. PEM and OpenSSH formats. Reject DSA keys (deprecated). Display a clear error message for passphrase-protected keys that are uploaded without the passphrase.

- **Port forwarding footgun:** Never enable port forwarding without explicit user intent. If added later, require a separate permission flag on the connection.

- **IPv6:** Test all connection flows with IPv6 addresses. Square bracket notation (`[::1]`) breaks naive host parsing.

- **Connection tags/groups:** Implement early. Users accumulate 20+ connections fast. Without grouping, the dashboard becomes unusable.

---

### 5.2 File Browser

**What it does:** Provides a tree-view of the remote filesystem over SFTP. Supports navigate, rename, delete, create folder, copy path, and context menu actions.

**Known issues & things to be aware of:**

- **Symlink loops:** A symlink pointing to a parent directory will cause infinite recursive listing. Detect symlinks (`lstat` vs `stat`) and show them as symlinks, never follow them automatically during tree expansion.

- **Permission errors:** Many directories on a server will return permission denied. Don't crash — show a lock icon and the error message inline. The user may still be able to navigate within their accessible paths.

- **Large directories:** A directory with 10,000+ files will freeze the UI if fully rendered. Implement virtual scrolling and paginate SFTP `readdir` calls (fetch 200 items at a time, load more on scroll).

- **Hidden files:** Show/hide toggle for dotfiles. Default: hidden. Remember the preference per-connection.

- **File watching:** The file tree does not auto-refresh. Add a manual refresh button and a "watch for changes" opt-in toggle that polls every N seconds. Never auto-poll without user enabling it — it creates unnecessary SSH load.

- **Drag and drop upload:** Handle drag events on the file tree panel. On drop, confirm the target path before uploading. Do not start upload if the user drops in the wrong area (editor, terminal).

- **Path breadcrumb:** Always show the full current path as a clickable breadcrumb. Users get disoriented navigating deep trees. Make each segment clickable to jump up.

- **Context menu consistency:** Right-click context menu must work on both tree items AND the empty space in a directory (for create new file/folder actions).

---

### 5.3 File Editor

**What it does:** Opens remote files in a browser-based editor. Reads the file over SFTP, allows editing, and writes back on explicit save (Ctrl/Cmd+S).

**Known issues & things to be aware of:**

- **Concurrent edit conflict:** Two users can open the same file simultaneously. When User B saves, they silently overwrite User A's changes. Implement last-write-wins with a visible "this file was modified on the server since you opened it" warning before saving.

- **Binary files:** Attempting to open a binary file (image, compiled binary, tar) in the editor must be blocked with a friendly message. Check MIME type or magic bytes before loading.

- **Large files:** Files over 2MB should show a warning: "This file is large. Opening it may be slow. Continue?" Never silently freeze the browser.

- **Unsaved changes guard:** If a user closes a tab or navigates away with unsaved changes, show a confirmation dialog. The browser's built-in `beforeunload` dialog is acceptable for now.

- **Line endings:** Preserve original line endings (CRLF on Windows servers). Do not silently convert. Show the current line ending mode (LF/CRLF) in the status bar.

- **Encoding:** Default to UTF-8. If the file is detected as non-UTF-8, warn the user and offer to open as read-only binary view.

- **File permissions after save:** Write the file back to the same path. Do not change ownership or permissions. If the write fails due to permissions, show the exact error and suggest `sudo`.

- **Auto-save:** Do NOT implement auto-save for remote files. A half-written config file on a production server is dangerous. Manual save only. Consider a "save draft locally" option that stores the unsaved version in memory only.

- **Scope:** Syntax highlighting for: JS/TS, Python, Bash, YAML, JSON, Dockerfile, Nginx conf, Apache conf, HTML/CSS, Go, Rust, Ruby, PHP. Beyond this, plain text mode. Do not build a plugin system — it's scope creep.

---

### 5.4 Terminal

**What it does:** Opens a PTY (pseudo-terminal) on the remote server over SSH and streams I/O bidirectionally over WebSocket.

**Known issues & things to be aware of:**

- **PTY size:** When the terminal pane is resized, send `SIGWINCH` to the remote PTY with the new columns/rows. If you don't, commands like `vim`, `htop`, `less` will render incorrectly.

- **Encoding edge cases:** Ensure the WebSocket transport is binary-safe. UTF-8 multi-byte characters and terminal escape sequences (ANSI color codes) must pass through unmodified. Do not attempt to parse or filter terminal output.

- **Session persistence (tmux integration):** Consider auto-starting a `tmux` session on connect (opt-in). This means a dropped WebSocket reconnects to the same running shell, preserving running processes. Without this, every reconnect starts a fresh shell.

- **Clipboard:** The browser clipboard API requires user gesture and HTTPS. Test `Ctrl+Shift+C`/`V` across browsers. Some terminal apps have non-standard clipboard bindings.

- **Scroll performance:** High-output commands (`tail -f`, `watch`, `htop`) produce thousands of lines. Use a circular buffer — keep last N lines (default 5000). Allow user to configure this. Never grow the DOM unboundedly.

- **Multiple tabs:** Each terminal tab is an independent PTY on the server. There is no shared state between tabs unless the user runs tmux manually. Make this clear in the UI (separate badge per tab).

- **Input latency:** Terminal I/O round-trips through WebSocket. On high-latency connections, typing feels sluggish. Use local echo for printable characters only — send the keystroke and immediately display it locally before the server echoes back. Disable local echo for password inputs (when terminal is in no-echo mode).

- **Connection drop behavior:** If the WebSocket drops, do not kill the remote process. Show a "Reconnecting..." banner. Attempt reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s). On successful reconnect, re-attach to the existing session if tmux integration is enabled.

- **Session recording:** Store terminal output as asciicasts (asciicast v2 format). Record timestamps per event. Never record terminal input (that may contain passwords). Implement this as a write-ahead log to disk, not in-memory, to survive server restarts.

---

### 5.5 File Transfer (Upload / Download)

**What it does:** Uploads files from the browser to a remote path over SFTP. Downloads files from the remote to the browser, streamed.

**Known issues & things to be aware of:**

- **Upload atomicity:** Do not write directly to the final destination path. Write to a temp file (`filename.tmp.XXXXXXXX`) in the same directory, then rename on completion. If the upload fails mid-way, the partial file is not left at the intended path.

- **Resumable uploads:** The planned feature. This requires: saving transfer state (file path, offset, checksum) in the database. On resume, verify the remote partial file exists and checksum matches, then continue from offset. Use SFTP's `SSH_FXP_WRITE` with the correct offset. Do not attempt this until basic upload is solid.

- **Download streaming:** Never buffer the entire file in server memory. Pipe the SFTP read stream directly to the HTTP response. Set appropriate headers: `Content-Disposition: attachment`, `Content-Type: application/octet-stream`, `Content-Length` if known.

- **Progress accuracy:** SFTP does not provide a reliable progress API for downloads. Track bytes sent/received manually. Show a progress bar with bytes transferred and estimated time remaining (rolling average of last 5 transfer rates).

- **Concurrent transfers:** Multiple simultaneous uploads should each have independent SFTP subsystem channels (not share one). SSH allows multiple channels per connection — use them.

- **Directory upload:** When uploading a folder (browser drag-and-drop), walk the tree client-side using the `FileSystemEntry` API. Upload files in parallel (max 5 concurrent). Show aggregate progress.

- **Transfer cancellation:** Cancelling a transfer must: abort the WebSocket stream, clean up the temp file on the remote, and update the transfer status in the UI. Do not leave orphaned temp files.

- **Filename encoding:** Remote servers may use filenames with special characters, spaces, or non-ASCII. Never URL-encode filenames in SFTP paths — SFTP handles raw bytes. Only encode for HTTP Content-Disposition headers.

---

### 5.6 Cloud Storage (S3 / GCS / Azure Blob / SMB) — Future

**What it does:** Connects to object storage buckets and SMB shares. Provides a file-browser-like interface for listing, downloading, uploading, and deleting objects.

**Known issues & things to be aware of:**

- **Object storage ≠ filesystem:** S3 has no real "folders." A "folder" is a key prefix ending in `/`. Your file browser must simulate folder hierarchy from flat key prefixes. Edge case: an object named `foo/` (the folder itself as an object) must be handled correctly.

- **Pagination:** S3 `ListObjectsV2` returns max 1000 keys per page. Always paginate. Never assume you have all objects after one API call.

- **Credentials scope:** S3 credentials (Access Key + Secret) must be stored with the same encryption as SSH credentials. Never log them. Support IAM role-based auth for EC2-hosted deployments.

- **Multi-region:** Each S3 bucket lives in a specific region. Requests to the wrong regional endpoint return a redirect or error. Detect and follow bucket region automatically.

- **Large object uploads:** Use S3 multipart upload for files > 5MB. Each part is 5–100MB. On failure, clean up incomplete multipart uploads (they cost money if left orphaned). Track `UploadId` and abort on cancel.

- **Build one provider first, generalize second.** Implement S3 completely. Then extract the interface. Then implement GCS/Azure as implementations of that interface. Do not try to abstract before you have two concrete implementations.

---

### 5.7 Team Access & RBAC — Future

**What it does:** Allows organization admins to share connection access with team members, define roles, and manage permissions.

**Data model (simplified):**
```
Role: OWNER | ADMIN | EDITOR | VIEWER
ConnectionAccess {
  connection_id: UUID
  user_id: UUID
  role: Role
  granted_by: UUID
  expires_at: timestamp (nullable)
  created_at: timestamp
}
```

**Known issues & things to be aware of:**

- **Design RBAC into the data model now, even if the UI ships later.** Every query that touches connections or sessions must include a `hasAccess(user_id, connection_id)` check. Retrofitting this after 20 features is painful.

- **Least privilege defaults:** New team members get VIEWER by default. Upgrade requires explicit admin action.

- **Viewer role definition:** A VIEWER can: open a terminal (read-only observation), browse files (no download), see transfer history. A VIEWER cannot: upload/download files, edit files, run commands. Implement this as a server-side capability check on every action, not just UI hiding.

- **Invitation flow:** Invite by email. Generate a signed invite token (JWT, 72hr expiry, single-use). On accept, create the access record. Send a confirmation email.

- **Audit all access changes:** Every grant, revoke, and role change is an audit log event with full actor identity.

---

## 6. Technical Architecture Rules

### WebSocket Protocol

All real-time communication (terminal I/O, transfer progress, server metrics) uses WebSocket with a typed message protocol:

```json
{
  "channel": "terminal | transfer | metrics | session",
  "session_id": "UUID",
  "type": "data | resize | ping | pong | error | status",
  "payload": {}
}
```

Never use raw strings through the WebSocket. Every message is JSON with a `channel` and `type`. This makes the message handler maintainable as features grow.

### SSH Session Lifecycle

```
States: PENDING → CONNECTING → VERIFYING_HOST_KEY → AUTHENTICATING → ACTIVE → IDLE → DISCONNECTED → ERROR

PENDING:             Connection profile loaded, user initiated connect
CONNECTING:          TCP connection to remote host in progress
VERIFYING_HOST_KEY:  Awaiting user confirmation if new/changed host key
AUTHENTICATING:      Key exchange / password auth in progress
ACTIVE:              Fully connected, I/O available
IDLE:                Connected, no activity for > 5 min (configurable)
DISCONNECTED:        Clean disconnect by user or server
ERROR:               Unexpected failure, error reason stored
```

Every state transition must be logged. The UI renders based on this state machine — never infer state from other signals.

### Process Architecture

```
┌─────────────────────────────────────────────┐
│ API Server (HTTP + WebSocket)                │
│  - Auth / session management                 │
│  - Connection CRUD                           │
│  - WebSocket upgrade handler                 │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ SSH Session Manager                          │
│  - One SSH client instance per connection    │
│  - Manages channel multiplexing              │
│  - Heartbeat loop                            │
│  - Session state machine                     │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
  SFTP Subsystem   PTY Channel
  (file browser,   (terminal)
   transfers)
```

**Rule:** The SSH Session Manager must be a separate internal service / process from the API server. They communicate over an internal message bus or IPC. This allows the SSH manager to be restarted independently without dropping API service.

### Database Schema Rules

- Every user-owned resource has a `user_id` foreign key. Every query that selects user resources must filter by `user_id`.
- Use UUIDs for all primary keys, not auto-increment integers.
- Add `created_at` and `updated_at` to every table.
- Audit logs table: append-only. No `updated_at`. Add a database trigger or application-level check to reject UPDATE/DELETE on this table.
- Credentials are never stored in the main `connections` table. They live in a separate `encrypted_credentials` table with an explicit join.

### API Design Rules

- Version all endpoints: `/api/v1/`
- Use standard HTTP verbs: GET (read), POST (create), PUT (full update), PATCH (partial update), DELETE (remove)
- All error responses follow this shape:

```json
{
  "error": {
    "code": "CONNECTION_NOT_FOUND",
    "message": "The requested connection does not exist or you do not have access.",
    "request_id": "UUID"
  }
}
```

- Never return raw exception messages to clients.
- All list endpoints support `limit` and `cursor` pagination. No offset pagination (it breaks under inserts).
- Rate limit every endpoint. Include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.

### Frontend State Rules

- Use a server state library (React Query / SWR / TanStack Query) for all remote data.
- The server is the single source of truth. Do not mirror server state into local component state.
- Optimistic updates only for low-risk actions (rename, favorite toggle). Never for deletes or transfers.
- Error states must be first-class. Every loading state has a corresponding error state with a retry action.

---

## 7. Rules & Regulations

### Open Source License

- Use **AGPL-3.0** for the open source core. This prevents companies from hosting it as a service without contributing back.
- Commercial/enterprise tier: Proprietary license. Two repos: `product-core` (AGPL) and `product-enterprise` (private).

### Data Privacy Compliance

| Regulation | Applicability | What to do |
|---|---|---|
| GDPR (EU) | Any EU users | User data export endpoint. Account deletion that removes all PII. Privacy policy. Cookie consent if using analytics. |
| CCPA (California) | CA users | "Do Not Sell" option. Data deletion on request. |
| India DPDP Act | Indian users | Data localization option for self-hosted. Consent records. |
| SOC 2 Type II | Enterprise customers | Audit logs, access controls, encryption at rest — all required. This is a roadmap item, not day-1. |

### Accessibility

- All interactive elements must be keyboard-navigable.
- Color is never the only signal — always pair with text or icon.
- Status indicators (online/offline) must have text equivalents for screen readers.
- WCAG 2.1 AA is the minimum target.

### Dependency Management

- Every new dependency must be justified. Ask: "What are we getting and could we write this in <2 hours?"
- Lock dependency versions in production builds.
- Run `npm audit` / `pip audit` as part of CI.
- No dependencies with known critical CVEs. Set up Dependabot or Renovate.
- Minimize client-side bundle size. The terminal and file browser are not excuses for 10MB JS bundles.

### API Key / Secret Hygiene

- No hardcoded secrets anywhere in the codebase, ever.
- Use environment variables. Document all required env vars in `.env.example`.
- Rotate all secrets annually at minimum. Force rotation on any suspected compromise.
- The product must start in a degraded-but-safe state if env vars are missing, with clear error messages.

---

## 8. Phase-by-Phase Roadmap

### Phase 0 — Foundation (Current)
**Goal:** A working SSH workspace that engineers actually prefer over their current tools.

- [x] SSH connection management
- [x] File browser (SFTP)
- [x] Terminal (PTY over WebSocket)
- [x] File editor (read/write)
- [x] File upload/download (streaming)
- [ ] Host key verification UI
- [ ] Connection state machine (all 7 states visible)
- [ ] Credential encryption at rest
- [ ] Basic audit log (server-side only)
- [ ] Self-hosted Docker compose setup + docs

**Exit criteria:** A solo developer can replace MobaXterm/Cyberduck with this product for their daily workflow.

---

### Phase 1 — Stickiness (Next 3 months)
**Goal:** Give users reasons to keep the tab open all day.

- [ ] Server health dashboard (CPU/memory/disk over SSH)
- [ ] Session recording (asciicast, opt-in)
- [ ] Multiple terminal tabs per connection
- [ ] tmux integration (auto-attach on reconnect)
- [ ] Resumable file transfers
- [ ] File transfer queue UI (pause, cancel, resume)
- [ ] Keyboard shortcuts (full list, configurable)
- [ ] Search within file tree
- [ ] Mobile-responsive layout (at least the dashboard)

**Exit criteria:** Users report opening the workspace first thing in the morning and leaving it open.

---

### Phase 2 — Team (Months 4–8)
**Goal:** Make this a product a manager will put on a company card.

- [ ] User accounts + invitations
- [ ] Organizations (multi-user, single org in free tier)
- [ ] RBAC (Owner / Admin / Editor / Viewer)
- [ ] Shared connection pools
- [ ] Audit log UI (searchable, filterable, exportable)
- [ ] Access expiration (time-bound grants)
- [ ] Team activity feed
- [ ] Email notifications (connection failure, access granted/revoked)

**Exit criteria:** A 5-person DevOps team can use this as their shared infrastructure workspace, with one admin managing access.

---

### Phase 3 — Expansion (Months 9–14)
**Goal:** Become the workspace for infrastructure, not just SSH.

- [ ] S3 integration (browse, upload, download, delete)
- [ ] Docker container management (list, logs, exec, lifecycle)
- [ ] Database browser (Postgres + MySQL, via SSH tunnel)
- [ ] GCS / Azure Blob integration
- [ ] AI assistant in terminal (contextual error explanation + command suggestion)
- [ ] Script library (saved commands, run with one click)
- [ ] SSO / SAML / OIDC (enterprise prerequisite)

**Exit criteria:** A user can manage their entire production infrastructure — servers, storage, databases, containers — without leaving the workspace.

---

### Phase 4 — Enterprise (Months 15+)
**Goal:** Unlock enterprise contracts and compliance-driven buyers.

- [ ] K8s cluster management (basic: pods, deployments, logs)
- [ ] LDAP / Active Directory integration
- [ ] IP allowlisting for workspace access
- [ ] Compliance report export (SOC 2 evidence package)
- [ ] Deployment automation (trigger deploys from workspace)
- [ ] On-premise enterprise installer (RPM/DEB + air-gapped)
- [ ] SLA, dedicated support tier

---

## 9. Decisions Log

> Record every significant technical or product decision here. Include the date, the options considered, and the reason for the choice. This prevents re-litigating the same decisions.

| Date | Decision | Options Considered | Reason |
|---|---|---|---|
| — | AGPL for open source core | MIT, Apache, AGPL | AGPL prevents hosting-as-a-service without contributing back. Builds community trust for self-hosters. |
| — | UUID primary keys | Auto-increment int, UUID | UUIDs are safe to expose in URLs/API. No enumeration attacks. Easier to merge data from multiple instances. |
| — | No auto-save in remote editor | Auto-save, manual save | Half-written configs on production servers are dangerous. Manual save only. |
| — | Typed WebSocket message protocol | Raw strings, JSON protocol | Typed protocol is maintainable as channels grow. Raw strings are a maintenance nightmare. |
| — | No port forwarding by default | Always on, opt-in, off | Security surface reduction. Explicit user intent required for port-forward. |
| — | No media streaming feature | Build it, defer it | Different product, different legal risk, different user. Zero overlap with core infrastructure persona. |
| — | Integrate with Tailscale/ZeroTier, not build mesh | Build own mesh, integrate | Tailscale is a mature product with years of NAT traversal R&D. Integration takes 2 days. Building it takes 6 months. |

---

*This is a living document. Update it when you change an architectural decision, discover a new security concern, or complete a phase. The worst version of this document is an outdated one.*
