package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
import com.weekend.architect.unift.remote.dto.TransferLogPageResponse;
import com.weekend.architect.unift.remote.dto.TransferLogResponse;
import com.weekend.architect.unift.remote.service.TransferHistoryService;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * REST API for querying the persistent file-transfer history.
 *
 * <p>Transfer log entries are automatically appended by the remote-connection service whenever an
 * upload or download completes, fails, or is canceled. This controller exposes read-only (plus
 * delete) access to that log.
 */
@RestController
@RequestMapping("/api/transfers/history")
@Slf4j
@Tag(
        name = "Transfer History",
        description = "Query the persistent audit log of all completed, failed, and cancelled file"
                + " transfers. Entries are written automatically when SFTP uploads and"
                + " downloads finish.")
@SecurityRequirement(name = "BearerAuth")
public class TransferHistoryController {

    private static final long STATS_STREAM_TIMEOUT_MS = 30L * 60 * 1000;
    private static final int MIN_STREAM_INTERVAL_MS = 1000;
    private static final int MAX_STREAM_INTERVAL_MS = 60000;

    private final TransferHistoryService service;
    private final ExecutorService virtualThreadExecutor;

    TransferHistoryController(
            TransferHistoryService service, @Qualifier("virtualThreadExecutor") ExecutorService virtualThreadExecutor) {
        this.service = service;
        this.virtualThreadExecutor = virtualThreadExecutor;
    }

    @GetMapping
    @Operation(
            summary = "List transfer history",
            description = "Returns a paginated list of transfer log entries for the authenticated user, newest first. "
                    + "Optional filters: sessionId (exact match), username (case-insensitive substring), "
                    + "status (exact: COMPLETED, FAILED, CANCELLED).",
            responses = {@ApiResponse(responseCode = "200", description = "Transfer history page")})
    public ResponseEntity<TransferLogPageResponse> listHistory(
            @Parameter(description = "0-based page index (default 0)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size, max 100 (default 20)")
                    @RequestParam(defaultValue = "20")
                    @Min(1)
                    @Max(100)
                    int size,
            @Parameter(description = "Filter by session ID (optional)") @RequestParam(required = false)
                    String sessionId,
            @Parameter(description = "Filter by SSH username, case-insensitive substring (optional)")
                    @RequestParam(required = false)
                    String username,
            @Parameter(description = "Filter by status: COMPLETED, FAILED, CANCELLED (optional)")
                    @RequestParam(required = false)
                    String status,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.debug(
                "[transfer-history] Listing history for user {} (page={}, size={}, sessionId={}, username={}, status={})",
                userId,
                page,
                size,
                sessionId,
                username,
                status);
        return ResponseEntity.ok(service.listHistory(userId, page, size, sessionId, username, status));
    }

    @GetMapping("/stats")
    @Operation(
            summary = "Transfer statistics",
            description = "Returns aggregate counts and totals derived from the user's transfer history.",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Aggregate stats",
                        content = @Content(schema = @Schema(implementation = TransferHistoryStatsResponse.class)))
            })
    public ResponseEntity<TransferHistoryStatsResponse> getStats(@AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.debug("[transfer-history] Stats requested for user {}", userId);
        return ResponseEntity.ok(service.getStats(userId));
    }

    @GetMapping(value = "/stats/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Stream aggregate transfer statistics via SSE")
    public SseEmitter streamStats(
            @RequestParam(defaultValue = "10000") int intervalMs, @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        int clampedIntervalMs = Math.max(MIN_STREAM_INTERVAL_MS, Math.min(MAX_STREAM_INTERVAL_MS, intervalMs));

        SseEmitter emitter = new SseEmitter(STATS_STREAM_TIMEOUT_MS);
        AtomicBoolean open = new AtomicBoolean(true);
        emitter.onCompletion(() -> open.set(false));
        emitter.onError(_ -> open.set(false));
        emitter.onTimeout(() -> {
            open.set(false);
            emitter.complete();
        });

        // Todo: move this logic to service class
        virtualThreadExecutor.submit(() -> {
            while (open.get()) {
                try {
                    TransferHistoryStatsResponse payload = service.getStats(userId);
                    emitter.send(SseEmitter.event().name("stats").data(payload));
                    Thread.sleep(clampedIntervalMs);
                } catch (InterruptedException _) {
                    Thread.currentThread().interrupt();
                    open.set(false);
                    emitter.complete();
                    return;
                } catch (IOException | IllegalStateException _) {
                    open.set(false);
                    return;
                } catch (Exception ex) {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("error")
                                .data(Map.of(
                                        "message",
                                        ex.getMessage() != null ? ex.getMessage() : "Transfer stats stream failed")));
                    } catch (IOException | IllegalStateException _) {
                        // ignored
                    }
                    open.set(false);
                    emitter.complete();
                    return;
                }
            }
        });

        return emitter;
    }

    @GetMapping("/{id}")
    @Operation(
            summary = "Get a transfer log entry",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Transfer log entry",
                        content = @Content(schema = @Schema(implementation = TransferLogResponse.class))),
                @ApiResponse(responseCode = "400", description = "Entry not found", content = @Content)
            })
    public ResponseEntity<TransferLogResponse> getEntry(
            @PathVariable UUID id, @AuthenticationPrincipal UniFtUserDetails principal) {
        log.debug(
                "[transfer-history] Fetching entry {} for user {}",
                id,
                principal.user().getId());
        return ResponseEntity.ok(service.getEntry(id, principal.user().getId()));
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Delete a transfer log entry",
            description = "Permanently removes a transfer log entry from the user's history.",
            responses = {
                @ApiResponse(responseCode = "204", description = "Entry deleted"),
                @ApiResponse(responseCode = "400", description = "Entry not found", content = @Content)
            })
    public ResponseEntity<Void> deleteEntry(
            @PathVariable UUID id, @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.info("[transfer-history] Deleting entry {} for user {}", id, userId);
        service.deleteEntry(id, userId);
        return ResponseEntity.noContent().build();
    }
}
