package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.core.PortForwardable;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.kubernetes.K8sExecTokenResolver.ResolvedToken;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.ConfigBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/**
 * Manages Fabric8 {@link KubernetesClient} instances — one per active SSH session.
 *
 * <h3>Exec credential support (EKS / GKE / AKS)</h3>
 * <p>Managed-cluster kubeconfigs use an {@code exec} section that spawns a local CLI
 * ({@code aws eks get-token}, {@code gke-gcloud-auth-plugin}, …) to obtain a
 * short-lived bearer token.  Fabric8 would try to run this command on the UniFT server
 * where neither the CLI nor cloud credentials are present, resulting in 401 Unauthorized.
 *
 * <p>This pool delegates to {@link K8sExecTokenResolver} to execute the credential
 * provider on the <em>remote SSH server</em>, then patches the kubeconfig YAML to
 * replace the {@code exec} section with the resolved static token before Fabric8
 * ever sees it.  Token refresh happens automatically — on every
 * {@link #resolveForSession} call the expiry is checked; if fewer than 2 minutes
 * remain the entry is evicted and rebuilt (re-running the exec command on SSH).
 *
 * <h3>Network reachability</h3>
 * <ol>
 *   <li><b>Direct</b> — API server URL in the kubeconfig is reachable from the UniFT host.</li>
 *   <li><b>SSH tunnel</b> — API server only reachable from within the SSH server;
 *       a JSch local port-forward is opened and the master URL is rewritten.</li>
 * </ol>
 *
 * <h3>Future direct-kubeconfig path</h3>
 * <p>Call {@link #registerDirect(String, String)} when a user uploads a kubeconfig
 * directly (no SSH).  Same pool, same {@code K8sServiceImpl}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class K8sClientPool {

    private static final int PROBE_TIMEOUT_MS = 3_000;

    private static final String READ_KUBECONFIG_CMD = "cat \"${KUBECONFIG:-$HOME/.kube/config}\" 2>/dev/null"
            + " || cat /root/.kube/config 2>/dev/null"
            + " || cat /etc/kubernetes/admin.conf 2>/dev/null";

    private final K8sExecTokenResolver execTokenResolver;

    private final ConcurrentHashMap<String, K8sClientEntry> pool = new ConcurrentHashMap<>();

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Returns the cached Fabric8 client for the session, building it on first call.
     * If the exec bearer token is about to expire it is refreshed transparently.
     */
    public KubernetesClient resolveForSession(String sessionId, RemoteShell shell) {
        K8sClientEntry existing = pool.get(sessionId);
        if (existing != null) {
            if (!existing.isTokenExpiringOrExpired()) {
                return existing.client();
            }
            // Token expiring — evict the old entry and fall through to rebuild
            log.info("[k8s-pool] Exec token expiring for session {}, refreshing client...", sessionId);
            pool.remove(sessionId);
            safeClose(sessionId, existing);
        }
        return pool.computeIfAbsent(sessionId, id -> buildFromSsh(id, shell)).client();
    }

    /**
     * Registers a Fabric8 client built directly from an uploaded kubeconfig string.
     * Used by the future "direct kubeconfig" feature — no SSH involved.
     */
    public KubernetesClient registerDirect(String clientKey, String kubeconfig) {
        K8sClientEntry old = pool.put(clientKey, buildEntry(clientKey, kubeconfig, null, null));
        if (old != null) safeClose(clientKey, old);
        return pool.get(clientKey).client();
    }

    /** Closes the client + any SSH port-forward for the given key. Safe if absent. */
    public void evict(String key) {
        K8sClientEntry entry = pool.remove(key);
        if (entry != null) safeClose(key, entry);
    }

    // ─── Builders ────────────────────────────────────────────────────────────

    private K8sClientEntry buildFromSsh(String sessionId, RemoteShell shell) {
        log.info("[k8s-pool] Building Fabric8 client for session {}", sessionId);

        // 1. Read raw kubeconfig from the SSH server
        String rawKubeconfig;
        try {
            rawKubeconfig = shell.executeCommand(READ_KUBECONFIG_CMD);
        } catch (Exception e) {
            throw new K8sClientInitException("Failed to read kubeconfig from SSH server", e);
        }
        if (rawKubeconfig == null || rawKubeconfig.isBlank()) {
            throw new K8sClientInitException("No kubeconfig found on remote host. "
                    + "Checked: $KUBECONFIG, ~/.kube/config, /root/.kube/config, /etc/kubernetes/admin.conf");
        }

        // 2. Resolve exec credentials on the SSH server if present (EKS, GKE, AKS, …).
        //    Fabric8 would try to run the exec command locally (UniFT server), where
        //    the cloud CLI and credentials are not present → 401.  We run it remotely.
        Optional<ResolvedToken> execToken = execTokenResolver.resolve(rawKubeconfig, shell);
        String kubeconfig = execToken
                .map(t -> execTokenResolver.patchKubeconfigWithToken(rawKubeconfig, t.token()))
                .orElse(rawKubeconfig);
        Instant tokenExpiresAt = execToken.map(ResolvedToken::expiresAt).orElse(null);

        // 3. Parse patched kubeconfig to obtain the API server URL
        Config base;
        try {
            base = Config.fromKubeconfig(kubeconfig);
        } catch (Exception e) {
            throw new K8sClientInitException("Invalid kubeconfig content", e);
        }

        String masterUrl = base.getMasterUrl();
        URI uri = URI.create(masterUrl);
        String apiHost = uri.getHost();
        int apiPort = uri.getPort() == -1 ? 443 : uri.getPort();

        // 4. Direct reachability vs. SSH port-forward tunnel
        K8sTunnel tunnel = null;
        if (isReachable(apiHost, apiPort)) {
            log.info("[k8s-pool] API server {} is directly reachable for session {}", masterUrl, sessionId);
        } else if (shell instanceof PortForwardable forwardable) {
            log.info(
                    "[k8s-pool] API server {} not directly reachable — opening SSH tunnel for session {}",
                    masterUrl,
                    sessionId);
            try {
                int localPort = forwardable.forwardLocalPort(apiHost, apiPort);
                tunnel = new K8sTunnel(forwardable, localPort);
                log.info(
                        "[k8s-pool] SSH tunnel localhost:{} → {}:{} established for session {}",
                        localPort,
                        apiHost,
                        apiPort,
                        sessionId);
            } catch (Exception e) {
                throw new K8sClientInitException("Failed to set up SSH tunnel to k8s API server", e);
            }
        } else {
            throw new K8sClientInitException("K8s API server " + masterUrl
                    + " is not reachable from UniFT and the connection does not support port forwarding");
        }

        return buildEntry(sessionId, kubeconfig, tunnel, tokenExpiresAt);
    }

    private K8sClientEntry buildEntry(
            String key, String kubeconfig, @Nullable K8sTunnel tunnel, @Nullable Instant tokenExpiresAt) {
        try {
            Config config = Config.fromKubeconfig(kubeconfig);
            if (tunnel != null) {
                config = new ConfigBuilder(config)
                        .withMasterUrl("https://127.0.0.1:" + tunnel.localPort())
                        .build();
            }
            KubernetesClient client =
                    new KubernetesClientBuilder().withConfig(config).build();
            log.info(
                    "[k8s-pool] Fabric8 client created for key {}, token expires at {}",
                    key,
                    tokenExpiresAt != null ? tokenExpiresAt : "never");
            return new K8sClientEntry(client, tunnel, tokenExpiresAt);
        } catch (Exception e) {
            if (tunnel != null) tunnel.close();
            throw new K8sClientInitException("Failed to create Fabric8 KubernetesClient", e);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private boolean isReachable(String host, int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), PROBE_TIMEOUT_MS);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private void safeClose(String key, K8sClientEntry entry) {
        try {
            entry.close();
            log.info("[k8s-pool] Closed Fabric8 client for key {}", key);
        } catch (Exception e) {
            log.warn("[k8s-pool] Error closing Fabric8 client for key {}: {}", key, e.getMessage());
        }
    }

    // ─── Inner types ─────────────────────────────────────────────────────────

    record K8sClientEntry(
            KubernetesClient client,
            @Nullable K8sTunnel tunnel,
            /** Expiry reported by the exec credential provider; null = static / no expiry. */
            @Nullable Instant tokenExpiresAt)
            implements AutoCloseable {

        /** Returns true when the exec token has expired or will do so within 2 minutes. */
        boolean isTokenExpiringOrExpired() {
            if (tokenExpiresAt == null) return false;
            return Instant.now().plusSeconds(120).isAfter(tokenExpiresAt);
        }

        @Override
        public void close() {
            try {
                client.close();
            } catch (Exception ignored) {
            }
            if (tunnel != null) tunnel.close();
        }
    }

    record K8sTunnel(PortForwardable connection, int localPort) implements AutoCloseable {
        @Override
        public void close() {
            connection.cancelPortForward(localPort);
        }
    }

    /** Thrown when a Fabric8 client cannot be initialised for a session. */
    public static class K8sClientInitException extends RuntimeException {
        public K8sClientInitException(String message) {
            super(message);
        }

        public K8sClientInitException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
