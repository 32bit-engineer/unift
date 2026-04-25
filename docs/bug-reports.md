# UniFT Bug Reports

This document contains bugs identified through code review of the UniFT backend (Java/Spring Boot) and frontend (React/TypeScript). Each entry is formatted as a GitHub issue ready for submission.

---

## Bug #1 — [Frontend] `console.log` Leaks API Base URL on Every Login

**Labels:** `bug`, `security`, `frontend`  
**Severity:** Low (Information Disclosure)

### Description

A debug `console.log` statement in `authStore.ts` prints the configured `API_BASE_URL` to the browser console on every login attempt. In production this exposes infrastructure details (hostname/IP, port, scheme) to anyone who opens DevTools.

### File

`unift-fe/src/store/authStore.ts`, line 53

```ts
console.log('route:', API_BASE_URL);
```

### Steps to Reproduce

1. Open the application in a browser.
2. Open DevTools → Console tab.
3. Navigate to the login page.
4. Enter any credentials and click **Sign in**.
5. Observe the console output.

### Expected Behavior

No debug output in the browser console for production builds.

### Actual Behavior

The full API base URL (e.g. `http://192.168.1.10:8080`) is printed to the console on every login attempt.

---

## Bug #2 — [Frontend] Stale JWT Decoded from localStorage on App Startup

**Labels:** `bug`, `frontend`, `auth`  
**Severity:** Medium

### Description

On page load, `hydrateUser()` in `authStore.ts` reads a token from `localStorage` and decodes it via `decodeUsername()`. If the token is expired or malformed, `decodeUsername` silently returns `null` and the store marks the user as **unauthenticated**, yet the token remains in `localStorage`. Subsequent API calls then attach the expired/invalid token, receive 401s, trigger an unnecessary token-refresh cycle, and may redirect the user to `/login` even if a valid refresh token exists.

### File

`unift-fe/src/store/authStore.ts`, lines 34–39

```ts
function hydrateUser(): AuthUser | null {
  const token = tokenStorage.getAccess();
  if (!token) return null;
  const username = decodeUsername(token);
  return username ? { username } : null;  // token stays in storage even when null
}
```

### Steps to Reproduce

1. Log in successfully — tokens are written to `localStorage`.
2. Manually corrupt the access token in DevTools (`localStorage.setItem('unift_access_token', 'bad.token')`).
3. Refresh the page.
4. The app sees `isAuthenticated: false` (no user decoded) yet `getAccess()` returns the bad token.
5. The token is still sent in the `Authorization` header of the first API call, causing an immediate 401.

### Expected Behavior

If the stored access token is malformed or expired on load, it should be cleared from `localStorage` immediately so the refresh flow starts with a clean state.

### Actual Behavior

The invalid token stays in storage and pollutes the first API request's `Authorization` header.

---

## Bug #3 — [Frontend] "Forgot Password?" Button Has No Handler — Dead UI Element

**Labels:** `bug`, `ui`, `frontend`  
**Severity:** Medium

### Description

The **Forgot password?** button on the login form is fully rendered and styled but has no `onClick` handler. Clicking it does nothing, leaving users with no way to recover their account. This is a non-functional UI element that degrades UX and may confuse users.

### File

`unift-fe/src/pages/AuthPage.tsx`, lines 186–192

```tsx
<button
  type="button"
  className="label-o hover:opacity-80 transition-opacity"
>
  Forgot password?
</button>
```

### Steps to Reproduce

1. Navigate to the login page (`/login` or `/`).
2. Click the **Forgot password?** link below the password field.
3. Nothing happens — no modal, no navigation, no toast message.

### Expected Behavior

Clicking "Forgot password?" should open a password-reset flow (e.g., email input modal, dedicated `/forgot-password` route, or at minimum an informational message).

### Actual Behavior

The button is inert — no action is triggered.

---

## Bug #4 — [Frontend] Auth Redirect Uses `window.location.href` Instead of React Router — Breaks SPA State

**Labels:** `bug`, `frontend`, `auth`  
**Severity:** Medium

### Description

When a token refresh fails (401 with no valid refresh token), `apiClient.ts` redirects the user by assigning `window.location.href = '/login'`. This causes a full page reload, destroying all in-memory React state (Zustand stores, component state, pending UI updates). It also bypasses React Router, preventing navigation guards or transition effects from running.

### File

`unift-fe/src/utils/apiClient.ts`, lines 86–88 and 131–133

```ts
tokenStorage.clear();
window.location.href = '/login';  // full-page reload
```

### Steps to Reproduce

1. Log in to the application.
2. Clear both tokens from `localStorage` (DevTools → Application → localStorage).
3. Trigger any authenticated API request (e.g., navigate to a page that loads data).
4. The app performs a hard full-page reload to `/login` instead of a client-side navigation.

### Expected Behavior

The application should use the React Router `navigate('/login')` function (or equivalent) to perform a client-side redirect, preserving SPA behavior and allowing proper state cleanup.

### Actual Behavior

A hard browser navigation (`window.location.href`) is triggered, causing a full page reload and loss of all in-memory state.

---

## Bug #5 — [Backend] Stale `failedLoginAttempts` Count Used for Account Lock Decision

**Labels:** `bug`, `backend`, `auth`  
**Severity:** High

### Description

In `AuthServiceImpl.handleFailedAttempt()`, the method calls `userRepository.incrementFailedLoginAttempts(user.getId())` (a database UPDATE) and then immediately reads `user.getFailedLoginAttempts() + 1` from the **in-memory object** loaded before the increment. Because the increment happens in the database but the check reads the stale Java object, `newCount` may be incorrect — especially in concurrent scenarios where two simultaneous failed logins both read the old count, both compute `newCount < MAX_FAILED_ATTEMPTS`, and neither triggers the account lock even though the true count now equals the threshold.

### File

`unift/src/main/java/.../auth/service/impl/AuthServiceImpl.java`, lines 174–187

```java
private void handleFailedAttempt(User user) {
    userRepository.incrementFailedLoginAttempts(user.getId()); // DB incremented
    int newCount = user.getFailedLoginAttempts() + 1;          // stale in-memory value!
    if (newCount >= MAX_FAILED_ATTEMPTS) {
        // may never trigger correctly under concurrent load
        userRepository.lockAccount(user.getId(), lockUntil);
    }
}
```

### Steps to Reproduce

1. Configure `MAX_FAILED_ATTEMPTS = 5`.
2. Send 4 failed login attempts for the same account sequentially — the count in the DB is 4.
3. Send the 5th failed login attempt — `user.getFailedLoginAttempts()` returns 4 (loaded before attempt #5), so `newCount = 5`, lock IS triggered in the single-user case.
4. However, send attempts #4 and #5 **concurrently**: both threads load the user with `failedLoginAttempts = 3`, both compute `newCount = 4`, neither triggers the lock even though the DB count is now 5.

### Expected Behavior

Account locking should be based on the authoritative post-increment count from the database (e.g., using a returning increment query or re-fetching the user).

### Actual Behavior

The lock decision is made on the stale pre-increment in-memory count, creating a race condition that can allow more than `MAX_FAILED_ATTEMPTS` login attempts before lockout.

---

## Bug #6 — [Backend] File Download Uses `java.nio.file.Paths` for a Remote Unix Path — Broken on Windows

**Labels:** `bug`, `backend`, `cross-platform`  
**Severity:** Medium

### Description

The `downloadFile` endpoint uses `Paths.get(decodedPath)` to extract the filename from a remote path. `Paths.get()` is Java's **local filesystem** API and uses the OS-native path separator. On Windows, `Paths.get("/home/user/file.txt").getFileName()` resolves the entire string as a single path component (because `/` is not the Windows separator), returning `"home"` or the full string as the filename instead of `"file.txt"`. This causes the downloaded file to have an incorrect name.

### File

`unift/src/main/java/.../remote/controller/RemoteConnectionController.java`, lines 327–333

```java
String decodedPath = URLDecoder.decode(path, StandardCharsets.UTF_8);
Path filePath = Paths.get(decodedPath);         // uses local OS separator
Path fileNamePath = filePath.getFileName();      // wrong on Windows
String filename = fileNamePath.toString();
```

### Steps to Reproduce

1. Run the UniFT backend on a **Windows** machine.
2. Connect to a remote SSH host.
3. Download a file whose remote path is e.g. `/home/user/report.pdf`.
4. The `Content-Disposition` header will contain an incorrect filename.

### Expected Behavior

The filename should always be extracted by splitting on `/` (the Unix path separator used by all supported remote protocols), regardless of the server OS.

### Actual Behavior

On Windows, `Paths.get("/home/user/report.pdf").getFileName()` returns `"home"` (the first component) or the full path string, causing the download to be saved with a wrong name.

---

## Bug #7 — [Backend] Missing Validation on `path` Request Parameters in File Operations

**Labels:** `bug`, `backend`, `security`  
**Severity:** Medium

### Description

The `deleteFile` and `createDirectory` endpoints accept a `path` query parameter with no input validation (no `@NotBlank`, no length limit, no format check). An attacker or misconfigured client can send:
- An empty string (`path=`)
- A path with null bytes (`path=/tmp/%00`)
- An extremely long path (>4096 chars)

These are passed directly to the service layer and eventually to the remote SSH/SFTP client without sanitisation.

### File

`unift/src/main/java/.../remote/controller/RemoteConnectionController.java`, lines 276–310

```java
@DeleteMapping("/sessions/{sessionId}/files")
public ResponseEntity<Void> deleteFile(
        @PathVariable String sessionId,
        @RequestParam String path,       // no @NotBlank, no @Size
        ...)
```

### Steps to Reproduce

1. Establish an active SSH session via the application.
2. Call `DELETE /api/remote/sessions/{sessionId}/files?path=` (empty path).
3. The request reaches the service layer without rejection; behavior depends on the remote SSH server.
4. Call `DELETE /api/remote/sessions/{sessionId}/files?path=%00/etc/passwd` (null-byte injection).

### Expected Behavior

The endpoint should reject requests with blank, null-byte-containing, or unreasonably long path values with HTTP 400 before the request reaches the service layer.

### Actual Behavior

No server-side validation — any string (including empty or null-byte-containing) is accepted and forwarded to the SSH/SFTP layer.

---

## Bug #8 — [Frontend] Multiple Concurrent 401 Responses Can Bypass the Token-Refresh Lock

**Labels:** `bug`, `frontend`, `auth`  
**Severity:** Medium

### Description

`apiClient.ts` uses a singleton `refreshPromise` to deduplicate concurrent token-refresh attempts. However, the lock is released in the `finally` block of the inner async IIFE (line 51: `refreshPromise = null`), which runs as soon as the refresh request completes — **before** all callers that were `await`ing the shared promise have had a chance to read the new token and retry their original requests. In a tight concurrency window this means a second 401 can arrive after the lock is cleared but before the first caller's retry succeeds, triggering a second refresh attempt with the now-rotated (and therefore invalid) refresh token, causing a second 401 and eventual logout.

### File

`unift-fe/src/utils/apiClient.ts`, lines 27–56

```ts
refreshPromise = (async (): Promise<boolean> => {
  // ... performs refresh ...
  tokenStorage.setAccess(refreshed.access_token);
  tokenStorage.setRefresh(refreshed.refresh_token);
  return true;
} finally {
  refreshPromise = null;  // lock released before callers finish retrying
})();
```

### Steps to Reproduce

1. Log in and let the access token expire.
2. Trigger 3+ simultaneous API calls that all receive 401.
3. All callers share the same `refreshPromise` and wait.
4. Refresh completes; `refreshPromise = null` immediately.
5. Before callers retry, a background poll fires another API call, sees `refreshPromise === null`, starts a new refresh with the already-rotated (now invalid) refresh token.
6. Second refresh returns 401 → `tokenStorage.clear()` → `window.location.href = '/login'`.

### Expected Behavior

The lock should remain held (or a new guard should prevent reuse) until all waiters have successfully retried their original requests with the new token.

### Actual Behavior

The lock is released prematurely, allowing a concurrent request to initiate a second refresh that fails because the refresh token has already been rotated.

---

## Bug #9 — [Frontend] Terminal WebSocket Sends JWT as Subprotocol — Token Exposed in Browser Network Tab

**Labels:** `bug`, `frontend`, `security`  
**Severity:** Low (Information Disclosure)

### Description

Because the browser WebSocket API does not support custom HTTP headers during the upgrade handshake, `useTerminal.ts` transmits the access JWT as a WebSocket subprotocol value: `Bearer.<token>`. This value is visible in plain text in the browser's **Network** tab under the WebSocket connection's headers (`Sec-WebSocket-Protocol`). Any browser extension, proxy, or shoulder-surfer with DevTools access can extract a valid JWT from the network panel.

### File

`unift-fe/src/hooks/useTerminal.ts`, lines 213–214

```ts
const wsUrl = `${wsProtocol}//${wsHost}/api/ws/terminal/${currentSessionId}`;
const wsProtocols = [`Bearer.${accessToken}`];  // JWT visible in Network tab
```

### Steps to Reproduce

1. Log in and open a terminal to a remote host.
2. Open DevTools → Network → WS tab.
3. Click the WebSocket connection and inspect the **Headers** section.
4. The `Sec-WebSocket-Protocol` request header contains the full JWT.

### Expected Behavior

The JWT should not appear verbatim in any header that is routinely visible in browser developer tools. Alternatives include a short-lived one-time WebSocket ticket endpoint, or transmitting the token in the first WebSocket message after the connection is open.

### Actual Behavior

The full access JWT is transmitted as the `Sec-WebSocket-Protocol` header value, visible in the browser Network tab.

---

## Bug #10 — [Frontend] `handleFailedAttempt` Account-Lock Timing Exposed in Login Error Message

**Labels:** `bug`, `backend`, `security`  
**Severity:** Low (Information Disclosure)

### Description

When an account is locked, `AuthServiceImpl.login()` throws `AccountLockedException` with the message:

```
"Account is locked until <ISO timestamp>. Too many failed login attempts."
```

This message is propagated through the global exception handler to the HTTP response body and then displayed verbatim in the frontend login error banner. An attacker performing a credential-stuffing attack learns:
1. That the exact username exists in the system.
2. Exactly when the lock expires, enabling them to time their next attempt.

### File

`unift/src/main/java/.../auth/service/impl/AuthServiceImpl.java`, lines 113–115

```java
throw new AccountLockedException(
    "Account is locked until " + user.getLockedUntil() + ". Too many failed login attempts.");
```

### Steps to Reproduce

1. Submit 5 consecutive failed login attempts for a valid username.
2. Submit a 6th failed attempt.
3. Inspect the HTTP response body — it contains the exact lock-expiry timestamp.
4. The frontend renders this timestamp directly in the error banner.

### Expected Behavior

The error message should be generic (e.g., "Too many login attempts. Please try again later.") without revealing the exact unlock time or confirming that the account exists.

### Actual Behavior

The full lock-expiry timestamp is returned to the client and displayed in the UI, revealing account-existence and lock-timing information to an attacker.
