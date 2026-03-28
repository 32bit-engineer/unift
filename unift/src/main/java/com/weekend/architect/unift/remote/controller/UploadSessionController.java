package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.remote.dto.UploadSessionRequest;
import com.weekend.architect.unift.remote.dto.UploadSessionResponse;
import com.weekend.architect.unift.remote.enums.UploadSessionStatus;
import com.weekend.architect.unift.remote.service.UploadSessionService;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST API for managing resumable chunked-upload sessions.
 *
 * <h4>Workflow</h4>
 * <ol>
 *   <li>Client calls {@code POST /api/uploads/sessions} to create a session and receives a
 *       session ID.</li>
 *   <li>Client uploads each chunk through the SFTP/stream endpoints (or any other channel)
 *       and then calls {@code POST /api/uploads/sessions/{id}/chunks/{chunkIndex}} to
 *       acknowledge receipt of that chunk (0-based index).</li>
 *   <li>When all chunks have been acknowledged the session status transitions automatically
 *       to {@code COMPLETED}.</li>
 *   <li>Sessions that are not completed within 48 hours are automatically marked
 *       {@code EXPIRED} on the next read.</li>
 * </ol>
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/uploads/sessions")
@Slf4j
@Tag(
        name = "Upload Sessions",
        description = "Manage resumable chunked-upload sessions. "
                + "Track which file chunks have been acknowledged and monitor overall progress.")
@SecurityRequirement(name = "BearerAuth")
public class UploadSessionController {

    private final UploadSessionService service;

    @PostMapping
    @Operation(
            summary = "Create a new upload session",
            description = "Registers a new resumable upload session. Returns the session ID and "
                    + "initial metadata. Status starts as PENDING.",
            responses = {
                @ApiResponse(
                        responseCode = "201",
                        description = "Session created",
                        content = @Content(schema = @Schema(implementation = UploadSessionResponse.class))),
                @ApiResponse(responseCode = "400", description = "Validation failed", content = @Content)
            })
    public ResponseEntity<UploadSessionResponse> createSession(
            @Valid @RequestBody UploadSessionRequest request, @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.info("[upload-session] Creating session for user {} → {}", userId, request.getFilename());
        UploadSessionResponse response = service.createSession(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    @Operation(
            summary = "List upload sessions",
            description = "Returns all upload sessions for the authenticated user, newest first. "
                    + "Optionally filter by status.",
            responses = {@ApiResponse(responseCode = "200", description = "Session list")})
    public ResponseEntity<List<UploadSessionResponse>> listSessions(
            @Parameter(
                            description = "Filter by status (PENDING, IN_PROGRESS, COMPLETED, FAILED, EXPIRED). "
                                    + "Omit to return all.")
                    @RequestParam(required = false)
                    UploadSessionStatus status,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.debug("[upload-session] Listing sessions for user {} (status={})", userId, status);
        return ResponseEntity.ok(service.listSessions(userId, status));
    }

    @GetMapping("/{sessionId}")
    @Operation(
            summary = "Get an upload session",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Session snapshot",
                        content = @Content(schema = @Schema(implementation = UploadSessionResponse.class))),
                @ApiResponse(responseCode = "404", description = "Session not found", content = @Content)
            })
    public ResponseEntity<UploadSessionResponse> getSession(
            @PathVariable UUID sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        log.debug(
                "[upload-session] Fetching session {} for user {}",
                sessionId,
                principal.user().getId());
        return ResponseEntity.ok(service.getSession(sessionId, principal.user().getId()));
    }

    @PostMapping("/{sessionId}/chunks/{chunkIndex}")
    @Operation(
            summary = "Acknowledge a chunk",
            description = "Marks chunk at the given 0-based index as received. "
                    + "When all chunks are acknowledged the session status transitions to COMPLETED automatically. "
                    + "Acknowledging a chunk that was already recorded is idempotent.",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Updated session snapshot",
                        content = @Content(schema = @Schema(implementation = UploadSessionResponse.class))),
                @ApiResponse(responseCode = "400", description = "Chunk index out of range", content = @Content),
                @ApiResponse(responseCode = "404", description = "Session not found", content = @Content),
                @ApiResponse(
                        responseCode = "409",
                        description = "Session is not in an active state (COMPLETED / FAILED / EXPIRED)",
                        content = @Content)
            })
    public ResponseEntity<UploadSessionResponse> acknowledgeChunk(
            @PathVariable UUID sessionId,
            @PathVariable int chunkIndex,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.debug("[upload-session] Acknowledging chunk {} for session {}", chunkIndex, sessionId);
        return ResponseEntity.ok(service.acknowledgeChunk(sessionId, userId, chunkIndex));
    }

    @DeleteMapping("/{sessionId}")
    @Operation(
            summary = "Abort an upload session",
            description = "Cancels and removes the upload session. "
                    + "Any partially-uploaded data on the remote host must be cleaned up separately.",
            responses = {
                @ApiResponse(responseCode = "204", description = "Session aborted"),
                @ApiResponse(responseCode = "404", description = "Session not found", content = @Content)
            })
    public ResponseEntity<Void> abortSession(
            @PathVariable UUID sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.info("[upload-session] Aborting session {} for user {}", sessionId, userId);
        service.abortSession(sessionId, userId);
        return ResponseEntity.noContent().build();
    }
}
