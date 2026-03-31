package com.weekend.architect.unift.common.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-IP rate-limiting filter backed by Caffeine caches.
 *
 * <p>A separate Caffeine cache is created per configured rule, keyed
 * by {@code clientIP + ":" + rulePath}. Each entry is an {@link AtomicInteger}
 * counter that expires after the rule's window duration. Requests that exceed
 * the limit receive HTTP 429 with standard {@code X-RateLimit-*} headers.
 *
 * <p>The filter runs before Spring Security's authentication filter so that
 * brute-force login attempts are blocked early, before any JWT/database work.
 */
@Slf4j
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitProperties properties;
    private final ObjectMapper objectMapper;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    // One Caffeine cache per unique windowSeconds value to ensure entries
    // expire at the correct rate. Key: windowSeconds -> Cache<compositeKey, counter>.
    private final ConcurrentHashMap<Integer, Cache<String, AtomicInteger>> cachesByWindow = new ConcurrentHashMap<>();

    public RateLimitFilter(RateLimitProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        if (!properties.isEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();
        String method = request.getMethod();

        RateLimitProperties.Rule matchedRule = findMatchingRule(path, method);
        if (matchedRule == null) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientIp = resolveClientIp(request);
        String cacheKey = clientIp + ":" + matchedRule.getPath();

        Cache<String, AtomicInteger> windowCache =
                cachesByWindow.computeIfAbsent(matchedRule.getWindowSeconds(), secs -> Caffeine.newBuilder()
                        .expireAfterWrite(Duration.ofSeconds(secs))
                        .maximumSize(50_000)
                        .build());

        AtomicInteger counter = windowCache.get(cacheKey, k -> new AtomicInteger(0));
        int current = counter.incrementAndGet();
        int limit = matchedRule.getMaxRequests();

        response.setHeader("X-RateLimit-Limit", String.valueOf(limit));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, limit - current)));
        response.setHeader("X-RateLimit-Reset", String.valueOf(matchedRule.getWindowSeconds()));

        if (current > limit) {
            log.warn("Rate limit exceeded for IP {} on {} {} ({}/{})", clientIp, method, path, current, limit);
            writeRateLimitResponse(response, matchedRule.getWindowSeconds());
            return;
        }

        filterChain.doFilter(request, response);
    }

    private RateLimitProperties.Rule findMatchingRule(String path, String method) {
        for (RateLimitProperties.Rule rule : properties.getRules()) {
            if (pathMatcher.match(rule.getPath(), path)) {
                if (rule.getMethods().isEmpty()
                        || rule.getMethods().stream().anyMatch(m -> m.equalsIgnoreCase(method))) {
                    return rule;
                }
            }
        }
        return null;
    }

    /**
     * Resolves the client IP, respecting {@code X-Forwarded-For} when behind
     * a reverse proxy. Uses the leftmost (original client) address.
     */
    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private void writeRateLimitResponse(HttpServletResponse response, int windowSeconds) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", String.valueOf(windowSeconds));

        Map<String, Object> body = Map.of(
                "status", HttpStatus.TOO_MANY_REQUESTS.value(),
                "error", HttpStatus.TOO_MANY_REQUESTS.getReasonPhrase(),
                "message", "Too many requests. Please try again later.",
                "timestamp", OffsetDateTime.now().toString());

        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
