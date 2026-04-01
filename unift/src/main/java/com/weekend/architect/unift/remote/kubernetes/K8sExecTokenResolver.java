package com.weekend.architect.unift.remote.kubernetes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * Resolves exec-based Kubernetes credentials on the remote SSH server.
 *
 * <h3>Why this is needed</h3>
 *
 * <p>Kubeconfigs for managed clusters (EKS, GKE, AKS) use an {@code exec} credential provider that
 * spawns a CLI tool ({@code aws}, {@code gke-gcloud-auth-plugin}, etc.) to obtain a short-lived
 * bearer token. When Fabric8 reads such a kubeconfig it tries to run the exec command on the
 * <em>local</em> machine — the UniFT server — where those CLIs are not installed and AWS/GCP
 * credentials are not present. The result is a missing token and a 401 Unauthorized from the k8s
 * API server.
 *
 * <h3>What this class does</h3>
 *
 * <ol>
 *   <li>Parse the kubeconfig YAML to locate the {@code exec} section of the current context's user
 *       entry.
 *   <li>Build the exact shell command (with env vars and arguments).
 *   <li>Execute it on the remote SSH server via the existing SSH channel — where the CLI is
 *       installed and credentials are configured.
 *   <li>Parse the {@code ExecCredential} JSON response and return the bearer token + expiry
 *       timestamp.
 * </ol>
 *
 * <h3>Callers</h3>
 *
 * <p>{@link K8sClientPool} calls {@link #resolve} during client construction, then {@link
 * #patchKubeconfigWithToken} to replace the {@code exec} section with a static {@code token} field
 * before passing the YAML to Fabric8 — so Fabric8 never attempts to run the exec command itself.
 *
 * <h3>Token refresh</h3>
 *
 * <p>{@link ResolvedToken#isExpiringOrExpired()} returns {@code true} when fewer than 2 minutes
 * remain before the expiry timestamp reported by the exec provider. {@link K8sClientPool} checks
 * this on every {@code resolveForSession} call and evicts + rebuilds the client entry (which
 * re-runs this resolver) when needed.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class K8sExecTokenResolver {

    private static final String BACKWARD_SLASH_2 = "'\\''";
    private static final String OUTER_QUOTE_ESCAPE = "'\"'\"'";
    private static final int REFRESH_BUFFER_SECONDS = 120;

    private final ObjectMapper objectMapper;

    public Map<String, Object> loadConfig(String kubeconfigYaml) {
        LoaderOptions loaderOptions = new LoaderOptions();
        SafeConstructor safeConstructor = new SafeConstructor(loaderOptions);
        return new Yaml(safeConstructor).load(kubeconfigYaml);
    }

    /**
     * Inspects the kubeconfig for an exec credential provider on the current context's user. If
     * found, executes the provider command on the SSH server and returns the resolved bearer token.
     *
     * @param kubeconfigYaml raw kubeconfig YAML content read from the SSH server
     * @param shell live SSH exec channel to the remote host
     * @return resolved token + expiry, or empty if no exec section was found
     */
    public Optional<ResolvedToken> resolve(String kubeconfigYaml, RemoteShell shell) {
        try {
            Map<String, Object> config = loadConfig(kubeconfigYaml);

            String currentContext = (String) config.get("current-context");
            if (currentContext == null) return Optional.empty();

            String userName = resolveUserName(config, currentContext);
            if (userName == null) return Optional.empty();

            Map<String, Object> execSection = findExecSection(config, userName);
            if (execSection == null) return Optional.empty();

            String cmd = buildShellCommand(execSection);
            log.info(
                    "[k8s-exec] Executing credential provider on SSH server for context '{}': {}",
                    currentContext,
                    truncate(cmd));

            String output = shell.executeCommand(cmd);
            if (output == null || output.isBlank()) {
                // Most likely cause: the credential provider binary (e.g. 'aws') is not on
                // the $PATH of the non-login SSH exec channel even though it works in an
                // interactive session. The command is wrapped in 'bash -l -c' to load the
                // user's profile — if still empty, check that 'bash' itself is on the
                // server's default PATH (/bin/bash) and that the profile sets PATH correctly.
                log.warn(
                        "[k8s-exec] Credential provider returned empty output. Verify that '{}' is"
                                + " on $PATH in a login shell on the SSH server.",
                        execSection.get("command"));
                return Optional.empty();
            }

            log.debug("[k8s-exec] Credential provider raw output: {}", truncate(output));

            // The provider may print log/warning lines before the JSON — skip to first '{'.
            String json = extractJson(output);
            JsonNode root = objectMapper.readTree(json);
            String token = root.path("status").path("token").asText(null);
            if (token == null || token.isBlank()) {
                log.warn("[k8s-exec] No token in credential provider output. Raw: {}", truncate(output));
                return Optional.empty();
            }

            Instant expiresAt = null;
            String expStr = root.path("status").path("expirationTimestamp").asText(null);
            if (expStr != null && !expStr.isBlank()) {
                try {
                    expiresAt = Instant.parse(expStr);
                } catch (Exception ignored) {
                    log.warn("[k8s-exec] Could not parse expirationTimestamp '{}'", expStr);
                }
            }

            log.info("[k8s-exec] Token resolved, expires at {}", expiresAt != null ? expiresAt : "never");
            return Optional.of(new ResolvedToken(token, expiresAt));

        } catch (Exception e) {
            log.warn("[k8s-exec] Failed to resolve exec credentials: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Replaces the {@code exec} credential section of every user entry that has one with a static
     * {@code token} field. This prevents Fabric8 from attempting to run the exec command on the
     * UniFT server.
     *
     * @param kubeconfigYaml original kubeconfig YAML
     * @param token bearer token obtained from the SSH server
     * @return patched YAML with {@code exec} replaced by {@code token}
     */
    @SuppressWarnings("unchecked")
    public String patchKubeconfigWithToken(String kubeconfigYaml, String token) {
        try {
            Map<String, Object> config = loadConfig(kubeconfigYaml);
            List<Map<String, Object>> users = (List<Map<String, Object>>) config.get("users");
            if (users != null) {
                for (Map<String, Object> userEntry : users) {
                    Map<String, Object> creds = (Map<String, Object>) userEntry.get("user");
                    if (creds != null && creds.containsKey("exec")) {
                        creds.remove("exec");
                        creds.put("token", token);
                    }
                }
            }
            DumperOptions opts = new DumperOptions();
            opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
            return new Yaml(opts).dump(config);
        } catch (Exception e) {
            log.warn("[k8s-exec] Failed to patch kubeconfig (using original): {}", e.getMessage());
            return kubeconfigYaml;
        }
    }

    @SuppressWarnings("unchecked")
    private String resolveUserName(Map<String, Object> config, String contextName) {
        List<Map<String, Object>> contexts = (List<Map<String, Object>>) config.get("contexts");
        if (contexts == null) return null;
        for (Map<String, Object> ctx : contexts) {
            if (contextName.equals(ctx.get("name"))) {
                Map<String, Object> ctxData = (Map<String, Object>) ctx.get("context");
                return ctxData != null ? (String) ctxData.get("user") : null;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findExecSection(Map<String, Object> config, String userName) {
        List<Map<String, Object>> users = (List<Map<String, Object>>) config.get("users");
        if (users == null) return Map.of();
        for (Map<String, Object> userEntry : users) {
            if (userName.equals(userEntry.get("name"))) {
                Map<String, Object> creds = (Map<String, Object>) userEntry.get("user");
                return creds != null ? (Map<String, Object>) creds.get("exec") : null;
            }
        }
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private String buildShellCommand(Map<String, Object> execSection) {
        String command = (String) execSection.get("command");
        List<String> args = (List<String>) execSection.getOrDefault("args", List.of());
        List<Map<String, String>> envList = (List<Map<String, String>>) execSection.get("env");

        StringBuilder inner = new StringBuilder();

        // Prepend env vars inline: NAME='value' (single-quote-safe)
        if (envList != null) {
            for (Map<String, String> env : envList) {
                String name = env.get("name");
                String value = env.get("value");
                if (name != null && value != null) {
                    if (!name.matches("[A-Za-z_][A-Za-z0-9_]*")) {
                        throw new RemoteConnectionException(
                                "Invalid env-var name in kubeconfig exec: " + truncate(name));
                    }
                    inner.append(name)
                            .append("='")
                            .append(value.replace("'", BACKWARD_SLASH_2))
                            .append("' ");
                }
            }
        }

        // Single-quote the command path and each argument
        inner.append("'").append(command.replace("'", BACKWARD_SLASH_2)).append("'");
        for (String arg : args) {
            inner.append(" '").append(arg.replace("'", BACKWARD_SLASH_2)).append("'");
        }

        // Wrap in bash -l -c '...' for login-shell PATH resolution.
        // Use '"'"' to escape inner single-quotes for the outer wrapper.
        // This avoids the double-escape corruption that '\'' would cause
        // (backslash is literal inside single-quotes, corrupting nested '\''
        // sequences).
        String outerEscaped = inner.toString().replace("'", OUTER_QUOTE_ESCAPE);
        return "bash -l -c '" + outerEscaped + "' 2>/dev/null";
    }

    /**
     * Finds the first {@code {…}} JSON object in the output string. Some exec providers write
     * warning lines to stdout before the JSON.
     */
    private String extractJson(String output) {
        int start = output.indexOf('{');
        int end = output.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return output.substring(start, end + 1);
        }
        return output.trim();
    }

    private String truncate(String s) {
        return s.length() > 100 ? s.substring(0, 100) + "…" : s;
    }

    /**
     * A resolved bearer token with an optional expiry timestamp reported by the exec credential
     * provider.
     */
    public record ResolvedToken(String token, @Nullable Instant expiresAt) {
        /**
         * Returns {@code true} when the token has already expired or will expire within the next
         * {@value K8sExecTokenResolver#REFRESH_BUFFER_SECONDS} seconds. {@link K8sClientPool} uses
         * this to trigger a proactive refresh.
         */
        public boolean isExpiringOrExpired() {
            if (expiresAt == null) return false;
            return Instant.now().plusSeconds(REFRESH_BUFFER_SECONDS).isAfter(expiresAt);
        }
    }
}
