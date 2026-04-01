package com.weekend.architect.unift.remote.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import com.github.dockerjava.transport.DockerHttpClient;
import com.weekend.architect.unift.remote.core.PortForwardable;
import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Manages docker-java {@link DockerClient} instances — one per active SSH session.
 *
 * <p>On the first Docker API call for a session, the pool:
 *
 * <ol>
 *   <li>Looks up the session's SSH connection from {@link SessionRegistry}.
 *   <li>Opens an SSH local port-forward from {@code localhost:{randomPort}} to the remote Docker
 *       daemon (TCP:2375 by default, with socket-bridge fallback).
 *   <li>Builds a {@link DockerClient} pointing at {@code tcp://127.0.0.1:{localPort}}.
 *   <li>Caches the entry in {@link DockerClientCache}.
 * </ol>
 *
 * <p>SSRF protection mirrors {@code K8sClientPool}: loopback, link-local, and site-local addresses
 * are blocked when probing the remote Docker daemon port.
 *
 * @see DockerClientCache
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DockerClientPool {

    private static final int DEFAULT_DOCKER_TCP_PORT = 2375;
    private static final int SOCAT_BRIDGE_PORT = 2376;

    private final DockerClientCache dockerClientCache;

    /**
     * Returns the cached {@link DockerClient} for the session, building it on first call. The
     * caller must supply the already-validated {@link RemoteConnection} so this pool does not
     * depend on {@code SessionRegistry} (avoiding a circular bean dependency).
     *
     * @param sessionId the SSH session identifier
     * @param connection the live SSH connection (must implement RemoteShell and PortForwardable)
     * @return a live DockerClient tunnelled to the remote daemon
     */
    public DockerClient resolveForSession(String sessionId, RemoteConnection connection) {
        DockerClientEntry existing = dockerClientCache.getIfPresent(sessionId);
        if (existing != null) {
            return existing.client();
        }
        return dockerClientCache
                .computeIfAbsent(sessionId, id -> buildFromSession(id, connection))
                .client();
    }

    /**
     * Closes the Docker client and tears down the SSH tunnel for the given session. Safe to call if
     * the session was never tunnelled (no-op).
     */
    public void evict(String sessionId) {
        DockerClientEntry entry = dockerClientCache.remove(sessionId);
        if (entry != null) {
            safeClose(sessionId, entry);
        }
    }

    @PreDestroy
    void shutdown() {
        log.info("[docker-pool] Shutting down — closing all cached Docker clients");
        for (var e : dockerClientCache.entries()) {
            safeClose(e.getKey(), e.getValue());
            dockerClientCache.remove(e.getKey());
        }
    }

    private DockerClientEntry buildFromSession(String sessionId, RemoteConnection conn) {
        log.info("[docker-pool] Building Docker client for session {}", sessionId);

        if (!(conn instanceof RemoteShell shell)) {
            throw new DockerClientInitException("Session " + sessionId + " does not support remote command execution");
        }
        if (!(conn instanceof PortForwardable forwardable)) {
            throw new DockerClientInitException("Session " + sessionId + " does not support port forwarding");
        }

        // Determine the remote Docker daemon port by probing TCP 2375 first,
        // falling back to starting a socat bridge on the remote host.
        int remotePort = resolveRemoteDaemonPort(shell);

        // Open SSH local port-forward: localhost:{auto} -> remote
        // localhost:{remotePort}
        int localPort;
        try {
            localPort = forwardable.forwardLocalPort("127.0.0.1", remotePort);
            log.info(
                    "[docker-pool] SSH tunnel localhost:{} -> remote 127.0.0.1:{} for session {}",
                    localPort,
                    remotePort,
                    sessionId);
        } catch (Exception e) {
            throw new DockerClientInitException("Failed to open SSH tunnel to Docker daemon", e);
        }

        // Build docker-java client pointing at the tunnel endpoint
        DockerClient client;
        try {
            DefaultDockerClientConfig config = DefaultDockerClientConfig.createDefaultConfigBuilder()
                    .withDockerHost("tcp://127.0.0.1:" + localPort)
                    .build();

            DockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                    .dockerHost(config.getDockerHost())
                    .sslConfig(config.getSSLConfig())
                    .maxConnections(100)
                    .connectionTimeout(Duration.ofSeconds(30))
                    .responseTimeout(Duration.ofSeconds(45))
                    .build();
            client = DockerClientImpl.getInstance(config, httpClient);

            // Verify the connection by pinging the daemon
            client.pingCmd().exec();
            log.info("[docker-pool] Docker client created and verified for session {}", sessionId);
        } catch (Exception e) {
            forwardable.cancelPortForward(localPort);
            throw new DockerClientInitException("Failed to connect to Docker daemon via tunnel", e);
        }

        return new DockerClientEntry(client, forwardable, localPort, Instant.now());
    }

    /**
     * Determines which port the Docker daemon is listening on at the remote host. Probes TCP 2375
     * first; if closed, verifies the Unix socket exists and that socat is available, then starts
     * (or reuses) a socat bridge on port 2376.
     */
    private int resolveRemoteDaemonPort(RemoteShell shell) {
        if (isRemotePortOpen(shell, DEFAULT_DOCKER_TCP_PORT)) {
            log.info("[docker-pool] Docker daemon TCP port {} is open on remote host", DEFAULT_DOCKER_TCP_PORT);
            return DEFAULT_DOCKER_TCP_PORT;
        }

        log.info("[docker-pool] TCP {} not open, running remote diagnostics", DEFAULT_DOCKER_TCP_PORT);
        String diagnostics = runRemoteDiagnostics(shell);

        if (!diagnostics.contains("SOCKET_EXISTS")) {
            throw new DockerClientInitException("Docker daemon is not reachable: TCP port "
                    + DEFAULT_DOCKER_TCP_PORT
                    + " is not open and /var/run/docker.sock does not exist. "
                    + "Ensure Docker is installed and running on the remote host.");
        }
        if (!diagnostics.contains("SOCAT_FOUND")) {
            throw new DockerClientInitException("Docker daemon listens on /var/run/docker.sock (Unix socket) "
                    + "but 'socat' is not installed on the remote host. "
                    + "Install socat (e.g., 'apt install socat' or 'yum install socat') "
                    + "or configure Docker to listen on TCP (dockerd -H tcp://127.0.0.1:"
                    + DEFAULT_DOCKER_TCP_PORT
                    + ").");
        }

        return startSocatBridge(shell);
    }

    /** Single SSH round-trip to check Docker socket presence and socat availability. */
    private String runRemoteDiagnostics(RemoteShell shell) {
        try {
            return shell.executeCommand("{ test -S /var/run/docker.sock && echo SOCKET_EXISTS || echo SOCKET_MISSING;"
                    + " }; { command -v socat >/dev/null 2>&1 && echo SOCAT_FOUND || echo"
                    + " SOCAT_MISSING; }");
        } catch (Exception e) {
            log.warn("[docker-pool] Remote diagnostics failed: {}", e.getMessage());
            return "";
        }
    }

    /**
     * Starts (or reuses) a socat bridge from TCP 2376 to the Docker Unix socket. Uses a single SSH
     * exec channel for startup + retry-probe to minimise round-trips.
     */
    private int startSocatBridge(RemoteShell shell) {
        int bridgePort = SOCAT_BRIDGE_PORT;

        if (isRemotePortOpen(shell, bridgePort)) {
            log.info("[docker-pool] Reusing existing socat bridge on remote port {}", bridgePort);
            return bridgePort;
        }

        log.info("[docker-pool] Starting socat bridge: TCP {} -> /var/run/docker.sock", bridgePort);
        try {
            String result = shell.executeCommand("nohup socat TCP-LISTEN:"
                    + bridgePort
                    + ",bind=127.0.0.1,fork,reuseaddr "
                    + "UNIX-CONNECT:/var/run/docker.sock >/dev/null 2>&1 & "
                    + "for i in 1 2 3 4 5 6; do sleep 0.5; "
                    + "if bash -c '(echo >/dev/tcp/127.0.0.1/"
                    + bridgePort
                    + ") 2>/dev/null' 2>/dev/null; then "
                    + "echo BRIDGE_READY; exit 0; fi; done; echo BRIDGE_FAILED");
            if (result != null && result.contains("BRIDGE_READY")) {
                log.info("[docker-pool] socat bridge verified on remote port {}", bridgePort);
                return bridgePort;
            }
        } catch (Exception e) {
            log.warn("[docker-pool] socat bridge startup failed: {}", e.getMessage());
        }

        throw new DockerClientInitException("socat bridge to /var/run/docker.sock was started but port "
                + bridgePort
                + " did not become reachable within 3 seconds. Verify the user has"
                + " read/write access to /var/run/docker.sock (e.g., is in the 'docker'"
                + " group).");
    }

    /**
     * Probes whether a TCP port is open on the remote host. Uses {@code bash -c /dev/tcp} as the
     * primary strategy (explicit bash invocation, not dependent on login shell), with {@code nc -z}
     * fallback for systems without bash.
     */
    private boolean isRemotePortOpen(RemoteShell shell, int port) {
        try {
            String result = shell.executeCommand("if bash -c '(echo >/dev/tcp/127.0.0.1/"
                    + port
                    + ") 2>/dev/null' 2>/dev/null; then "
                    + "echo OPEN; "
                    + "elif nc -z -w2 127.0.0.1 "
                    + port
                    + " 2>/dev/null; then "
                    + "echo OPEN; "
                    + "else echo CLOSED; fi");
            return result != null && result.trim().contains("OPEN");
        } catch (Exception _) {
            return false;
        }
    }

    private void safeClose(String key, DockerClientEntry entry) {
        try {
            entry.close();
            log.info("[docker-pool] Closed Docker client for session {}", key);
        } catch (Exception e) {
            log.warn("[docker-pool] Error closing Docker client for session {}: {}", key, e.getMessage());
        }
    }

    /**
     * Holds a live DockerClient together with the SSH tunnel metadata required to clean up when the
     * session ends.
     */
    record DockerClientEntry(DockerClient client, PortForwardable tunnel, int localPort, Instant createdAt)
            implements AutoCloseable {

        @Override
        public void close() {
            try {
                client.close();
            } catch (Exception _) {
                // best-effort close
            }
            tunnel.cancelPortForward(localPort);
        }
    }

    /** Thrown when a Docker client cannot be initialised for a session. */
    public static class DockerClientInitException extends RuntimeException {
        public DockerClientInitException(String message) {
            super(message);
        }

        public DockerClientInitException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
