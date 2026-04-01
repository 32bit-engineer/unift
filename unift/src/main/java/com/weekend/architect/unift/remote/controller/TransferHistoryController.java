package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
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
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST API for querying the persistent file-transfer history.
 *
 * <p>Transfer log entries are automatically appended by the remote-connection service whenever an
 * upload or download completes, fails, or is cancelled. This controller exposes read-only (plus
 * delete) access to that log.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/transfers/history")
@Slf4j
@Tag(
        name = "Transfer History",
        description = "Query the persistent audit log of all completed, failed, and cancelled file"
                + " transfers. Entries are written automatically when SFTP uploads and"
                + " downloads finish.")
@SecurityRequirement(name = "BearerAuth")
public class TransferHistoryController {

    private final TransferHistoryService service;

    @GetMapping
    @Operation(
            summary = "List transfer history",
            description =
                    "Returns a paginated list of transfer log entries for the authenticated user, " + "newest first.",
            responses = {@ApiResponse(responseCode = "200", description = "Transfer history page")})
    public ResponseEntity<List<TransferLogResponse>> listHistory(
            @Parameter(description = "0-based page index (default 0)") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size, max 100 (default 20)")
                    @RequestParam(defaultValue = "20")
                    @Min(1)
                    @Max(100)
                    int size,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.debug("[transfer-history] Listing history for user {} (page={}, size={})", userId, page, size);
        return ResponseEntity.ok(service.listHistory(userId, page, size));
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
