package com.weekend.architect.unift.common.filter;

import java.util.List;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Configurable rate-limiting rules, bound to {@code unift.rate-limit} in
 * {@code application.yaml}.
 *
 * <p>Each rule specifies a path pattern, the HTTP method(s) it applies to,
 * the allowed number of requests per window, and the window size in seconds.
 * Rules are evaluated in order; the first match wins.
 *
 * <p>Requests that do not match any rule are not rate-limited.
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "unift.rate-limit")
public class RateLimitProperties {

    private boolean enabled = true;

    /**
     * Ordered list of rate-limit rules. First matching rule wins.
     */
    private List<Rule> rules = List.of();

    /**
     * Default rate limit applied to paths that match no explicit rule.
     * Set to 0 to disable the default limit.
     */
    private int defaultRequestsPerWindow = 0;

    private int defaultWindowSeconds = 60;

    @Data
    public static class Rule {

        /**
         * Ant-style path pattern, e.g. {@code /api/auth/login} or {@code /api/remote/sessions}.
         */
        private String path;

        /**
         * HTTP methods this rule applies to (e.g. POST, GET). Empty list means all methods.
         */
        private List<String> methods = List.of();

        /**
         * Maximum number of requests allowed per window.
         */
        private int maxRequests = 10;

        /**
         * Window duration in seconds.
         */
        private int windowSeconds = 60;
    }
}
