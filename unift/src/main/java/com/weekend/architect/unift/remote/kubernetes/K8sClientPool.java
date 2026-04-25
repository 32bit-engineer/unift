package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.kubernetes.K8sExecTokenResolver.ResolvedToken;
import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Manages Fabric8 {@link KubernetesClient} instances — one per active SSH session.
 *
 * <h6>Exec credential support (EKS / GKE / AKS)</h6>
 *
 * <p>Managed-cluster kubeconfigs use an {@code exec} section that spawns a local CLI ({@code aws
 * eks get-token}, {@code gke-gcloud-auth-plugin}, {@code kubelogin}, …) to obtain a short-lived
 * bearer token. Fabric8 would try to run this command on the UniFT server where neither the CLI
 * nor cloud credentials are present, resulting in 401 Unauthorized.
 *
 * <p>This pool delegates to {@link K8sExecTokenResolver} to execute the credential provider on the
 * <em>remote SSH server</em>, then patches the kubeconfig YAML to replace the {@code exec} section
 * with the resolved static token before Fabric8 ever sees it.
 *
 * <h6>Network reachability</h6>
 *
 * <p>The K8s API server URL from the kubeconfig must be directly reachable from the UniFT host.
 * If the endpoint is not reachable, client creation is rejected immediately — no SSH tunnel
 * fallback is attempted. This keeps the failure surface small and the error message explicit.
 *
 * <h6>Cloud agnosticism</h6>
 *
 * <p>Any valid kubeconfig works — EKS, AKS, GKE, Oracle OKE, self-hosted clusters, or any
 * distribution that can produce a kubeconfig (k3s, kind, kubeadm, …). The only requirement is
 * that the API server endpoint in the kubeconfig is reachable from the UniFT host.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class K8sClientPool {

    private static final int PROBE_TIMEOUT_MS = 3_000;

    private static final String READ_KUBECONFIG_CMD =
            "cat \"${KUBECONFIG:-$HOME/.kube/config}\" 2>/dev/null"
            + " || cat /root/.kube/config 2>/dev/null"
            + " || cat /etc/kubernetes/admin.conf 2>/dev/null";

    private static final Set<String> BLOCKED_HOSTS = Set.of("169.254.169.254", "fd00::ec2");

    private final K8sClientCache k8sClientCache;

    private final K8sExecTokenResolver execTokenResolver;

    /**
     * Returns the cached Fabric8 client for the session, building it on first call.
     * If the exec bearer token is about to expire it is refreshed transparently.
     */
    public KubernetesClient resolveForSession(String sessionId, RemoteShell shell) {
        K8sClientEntry existing = k8sClientCache.getIfPresent(sessionId);
        if (existing != null) {
            if (!existing.isTokenExpiringOrExpired()) {
                return existing.client();
            }
            // Token expiring — evict the old entry and fall through to rebuild
            log.info("[k8s-pool] Exec token expiring for session {}, refreshing client...", sessionId);
            k8sClientCache.remove(sessionId);
            safeClose(sessionId, existing);
        }
        return k8sClientCache
                .computeIfAbsent(sessionId, id -> buildFromSsh(id, shell))
                .client();
    }

    /**
     * Registers a Fabric8 client built directly from an uploaded kubeconfig string.
     * Used by the future "direct kubeconfig" feature — no SSH involved.
     * Reachability of the API server is validated before the entry is stored.
     */
    public KubernetesClient registerDirect(String clientKey, String kubeconfig) {
        assertKubeconfigReachable(kubeconfig);
        K8sClientEntry old = k8sClientCache.getIfPresent(clientKey);
        k8sClientCache.put(clientKey, buildEntry(clientKey, kubeconfig, null));
        if (old != null) safeClose(clientKey, old);
        return k8sClientCache.getIfPresent(clientKey).client();
    }

    /** Closes the Fabric8 client for the given key. Safe if absent. */
    public void evict(String key) {
        K8sClientEntry entry = k8sClientCache.remove(key);
        if (entry != null) safeClose(key, entry);
    }

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
            throw new K8sClientInitException(
                    "No kubeconfig found on remote host. Checked: $KUBECONFIG, ~/.kube/config,"
                    + " /root/.kube/config, /etc/kubernetes/admin.conf");
        }

        // 2. Resolve exec credentials on the SSH server if present (EKS, GKE, AKS, …).
        // Fabric8 would try to run the exec command locally (UniFT server), where
        // the cloud CLI and credentials are not present → 401. We run it remotely instead.
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

        // 4. Fail fast if the API server is not directly reachable from the UniFT host.
        // No port-forward fallback — an unreachable endpoint means every subsequent
        // Fabric8 call would also fail, so we surface the error here with a clear message.
        String masterUrl = base.getMasterUrl();
        URI uri = URI.create(masterUrl);
        String apiHost = uri.getHost();
        int apiPort = uri.getPort() == -1 ? 443 : uri.getPort();

        if (!isReachable(apiHost, apiPort)) {
            throw new K8sClientInitException(
                    "K8s API server " + masterUrl + " is not reachable from the UniFT host. "
                    + "Ensure the cluster endpoint is accessible before connecting.");
        }
        log.info("[k8s-pool] API server {} is directly reachable for session {}", masterUrl, sessionId);

        return buildEntry(sessionId, kubeconfig, tokenExpiresAt);
    }

    private K8sClientEntry buildEntry(String key, String kubeconfig, @Nullable Instant tokenExpiresAt) {
        try {
            Config config = Config.fromKubeconfig(kubeconfig);
            KubernetesClient client = new KubernetesClientBuilder().withConfig(config).build();
            log.info(
                    "[k8s-pool] Fabric8 client created for key {}, token expires at {}",
                    key,
                    tokenExpiresAt != null ? tokenExpiresAt : "never");
            return new K8sClientEntry(client, tokenExpiresAt);
        } catch (Exception e) {
            throw new K8sClientInitException("Failed to create Fabric8 KubernetesClient", e);
        }
    }

    private void assertKubeconfigReachable(String kubeconfig) {
        Config base;
        try {
            base = Config.fromKubeconfig(kubeconfig);
        } catch (Exception e) {
            throw new K8sClientInitException("Invalid kubeconfig content", e);
        }
        URI uri = URI.create(base.getMasterUrl());
        String host = uri.getHost();
        int port = uri.getPort() == -1 ? 443 : uri.getPort();
        if (!isReachable(host, port)) {
            throw new K8sClientInitException(
                    "K8s API server " + base.getMasterUrl() + " is not reachable from the UniFT host.");
        }
    }

    private boolean isReachable(String host, int port) {
        try {
            InetAddress addr = InetAddress.getByName(host);
            if (addr.isLoopbackAddress()
                    || addr.isLinkLocalAddress()
                    || addr.isSiteLocalAddress()
                    || BLOCKED_HOSTS.contains(addr.getHostAddress())) {
                log.warn("[k8s-pool] isReachable blocked SSRF-risk host: {}", host);
                return false;
            }
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(addr, port), PROBE_TIMEOUT_MS);
                return true;
            }
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

    record K8sClientEntry(
            KubernetesClient client,
            /** Expiry reported by the exec credential provider; null = static / no expiry. */
            @Nullable Instant tokenExpiresAt)
            implements AutoCloseable {

        /** Returns true when the exec token has expired or will expire within 2 minutes. */
        boolean isTokenExpiringOrExpired() {
            if (tokenExpiresAt == null) return false;
            return Instant.now().plusSeconds(120).isAfter(tokenExpiresAt);
        }

        @Override
        public void close() {
            try {
                client.close();
            } catch (Exception ignored) {
                // best-effort close
            }
        }
    }

    /** Thrown when a Fabric8 client cannot be initialized for a session. */
    public static class K8sClientInitException extends RuntimeException {
        public K8sClientInitException(String message) {
            super(message);
        }

        public K8sClientInitException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
