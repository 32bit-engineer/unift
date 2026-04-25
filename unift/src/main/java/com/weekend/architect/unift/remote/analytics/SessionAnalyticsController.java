package com.weekend.architect.unift.remote.analytics;

import com.weekend.architect.unift.remote.analytics.dto.AnalyticsHistoryResponse;
import com.weekend.architect.unift.remote.analytics.dto.SessionAnalyticsResponse;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/remote")
@Slf4j
@Tag(
        name = "Session Analytics",
        description = "Real-time analytics for active SSH sessions: session duration, throughput,"
                + " latency, packet loss, traffic analysis, connected-nodes map, session"
                + " metadata, and remote-host system metrics (CPU / memory / disk). Every probe"
                + " is automatically persisted so you can query historical data by session ID"
                + " and date range.")
@SecurityRequirement(name = "BearerAuth")
public class SessionAnalyticsController {

    private final SessionAnalyticsService analyticsService;

    @GetMapping("/sessions/{sessionId}/analytics")
    @Operation(
            summary = "Get live session analytics",
            description = "Returns a real-time analytics snapshot for the given active session. Includes"
                    + " session duration, throughput history, SSH exec latency, ICMP"
                    + " packet-loss, remote CPU/memory/disk usage, connected-node map, and SSH"
                    + " session metadata. The snapshot is automatically saved to the database"
                    + " for future history queries. Expensive probes (latency, ping, system"
                    + " metrics) run in parallel and are time-bounded — the call always returns"
                    + " within ~12 s.",
            parameters = {@Parameter(name = "sessionId", description = "Active session ID", required = true)},
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Analytics snapshot",
                        content = @Content(schema = @Schema(implementation = SessionAnalyticsResponse.class))),
                @ApiResponse(responseCode = "404", description = "Session not found", content = @Content),
                @ApiResponse(responseCode = "403", description = "Session owned by another user", content = @Content),
                @ApiResponse(responseCode = "410", description = "Session expired", content = @Content)
            })
    public ResponseEntity<SessionAnalyticsResponse> getAnalytics(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID ownerId = principal.user().getId();
        log.info("[analytics] Snapshot requested for session {} by user {}", sessionId, ownerId);

        SessionAnalyticsResponse response = analyticsService.getAnalytics(sessionId, ownerId);

        log.info(
                "[analytics] Snapshot assembled for session {} — duration={}, latency={}ms",
                sessionId,
                response.getSessionDurationFormatted(),
                response.getLatency() != null
                        ? String.format("%.1f", response.getLatency().getAvgMs())
                        : "n/a");

        return ResponseEntity.ok(response);
    }

    @GetMapping(value = "/sessions/{sessionId}/analytics/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(
            summary = "Stream live session analytics via SSE",
            description = "Pushes analytics snapshots continuously while the client is connected."
                    + " First snapshot is sent immediately, then repeated at the requested interval.")
    public SseEmitter streamAnalytics(
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "5000") int intervalMs,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return analyticsService.streamAnalytics(sessionId, principal.user().getId(), intervalMs);
    }

    @GetMapping("/sessions/{sessionId}/analytics/history")
    @Operation(
            summary = "Get historical analytics for a session",
            description = "Returns previously captured analytics snapshots for the given session, ordered"
                    + " newest-first. A snapshot is saved every time the live analytics"
                    + " endpoint is called. Optionally filter by date range with `from` / `to`"
                    + " (ISO-8601). Works for both active and closed sessions. Ownership is"
                    + " enforced at the database level — users can only query their own"
                    + " sessions.",
            parameters = {
                @Parameter(name = "sessionId", description = "Session ID", required = true),
                @Parameter(name = "from", description = "Inclusive lower bound (ISO-8601, e.g. 2026-03-01T00:00:00Z)"),
                @Parameter(name = "to", description = "Inclusive upper bound (ISO-8601, e.g. 2026-03-28T23:59:59Z)"),
                @Parameter(name = "limit", description = "Max results (default 100, max 500)")
            },
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Historical snapshots (newest first)",
                        content = @Content(schema = @Schema(implementation = AnalyticsHistoryResponse.class))),
                @ApiResponse(responseCode = "400", description = "Invalid date range", content = @Content)
            })
    public ResponseEntity<AnalyticsHistoryResponse> getAnalyticsHistory(
            @PathVariable String sessionId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(defaultValue = "100") int limit,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID ownerId = principal.user().getId();
        log.debug(
                "[analytics] History query for session {} by user {} (from={}, to={}, limit={})",
                sessionId,
                ownerId,
                from,
                to,
                limit);

        AnalyticsHistoryResponse history = analyticsService.getAnalyticsHistory(sessionId, ownerId, from, to, limit);

        log.debug("[analytics] Returning {} snapshots for session {}", history.getCount(), sessionId);
        return ResponseEntity.ok(history);
    }
}
