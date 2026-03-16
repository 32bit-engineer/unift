package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.dto.ConnectResponse;
import com.weekend.architect.unift.remote.dto.DirectoryListingResponse;
import com.weekend.architect.unift.remote.dto.RenameRequest;
import com.weekend.architect.unift.remote.dto.TransferStatusResponse;
import com.weekend.architect.unift.remote.service.RemoteConnectionService;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/remote")
@Slf4j
@Tag(
        name = "Remote Connections",
        description = "Session-based SSH/SFTP connections: browse directories and stream files")
@SecurityRequirement(name = "BearerAuth")
public class RemoteConnectionController {

    private final RemoteConnectionService service;

    // Session management endpoints

    @PostMapping("/sessions")
    @Operation(
            summary = "Open a remote session",
            description = "Connect to a remote host. Returns a session ID valid for the configured TTL.",
            responses = {
                @ApiResponse(
                        responseCode = "201",
                        description = "Session opened",
                        content = @Content(schema = @Schema(implementation = ConnectResponse.class))),
                @ApiResponse(responseCode = "400", description = "Invalid request / credentials", content = @Content),
                @ApiResponse(responseCode = "429", description = "Max sessions exceeded", content = @Content),
                @ApiResponse(responseCode = "502", description = "Could not connect to remote host", content = @Content)
            })
    public ResponseEntity<ConnectResponse> openSession(
            @Valid @RequestBody ConnectRequest request, @AuthenticationPrincipal UniFtUserDetails principal) {
        UUID ownerId = principal.user().getId();
        log.info("Opening session for user {} → {}:{}", ownerId, request.getHost(), request.getPort());
        ConnectResponse response = service.openSession(ownerId, request);
        log.info("Session {} opened successfully", response.getSessionId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/sessions")
    @Operation(summary = "List all active sessions for the current user")
    public ResponseEntity<List<ConnectResponse>> listSessions(@AuthenticationPrincipal UniFtUserDetails principal) {
        UUID userId = principal.user().getId();
        log.debug("Fetching sessions for user {}", userId);
        List<ConnectResponse> sessions = service.listSessions(userId);
        log.debug("Found {} active sessions", sessions.size());
        return ResponseEntity.ok(sessions);
    }

    @GetMapping("/sessions/{sessionId}")
    @Operation(
            summary = "Get session status",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Session info",
                        content = @Content(schema = @Schema(implementation = ConnectResponse.class))),
                @ApiResponse(responseCode = "404", description = "Session not found", content = @Content),
                @ApiResponse(responseCode = "410", description = "Session expired", content = @Content)
            })
    public ResponseEntity<ConnectResponse> getSession(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        log.debug(
                "Retrieving session {} for user {}", sessionId, principal.user().getId());
        ConnectResponse response =
                service.getSession(sessionId, principal.user().getId());
        log.debug("Session {} retrieved", sessionId);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/sessions/{sessionId}")
    @Operation(summary = "Close a remote session", description = "Disconnects and releases all resources.")
    public ResponseEntity<Void> closeSession(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        log.info("Closing session {} for user {}", sessionId, principal.user().getId());
        service.closeSession(sessionId, principal.user().getId());
        log.info("Session {} closed", sessionId);
        return ResponseEntity.noContent().build();
    }

    // Directory browsing endpoints

    @GetMapping("/sessions/{sessionId}/files")
    @Operation(
            summary = "List remote directory",
            description = "Returns all entries at the given path. Omit `path` to list the user's home directory.",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Directory listing",
                        content = @Content(schema = @Schema(implementation = DirectoryListingResponse.class))),
                @ApiResponse(responseCode = "502", description = "Remote browse error", content = @Content)
            })
    public ResponseEntity<DirectoryListingResponse> listDirectory(
            @PathVariable String sessionId,
            @Parameter(description = "Absolute remote path to list (defaults to home directory)")
                    @RequestParam(required = false)
                    String path,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        log.debug("Listing directory in session {} → {}", sessionId, path != null ? path : "<home>");
        DirectoryListingResponse listing =
                service.listDirectory(sessionId, principal.user().getId(), path);
        log.debug("Found {} entries in {}", listing.getTotalEntries(), listing.getPath());
        return ResponseEntity.ok(listing);
    }

    @DeleteMapping("/sessions/{sessionId}/files")
    @Operation(summary = "Delete a remote file or empty directory")
    public ResponseEntity<Void> deleteFile(
            @PathVariable String sessionId,
            @RequestParam String path,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        log.info("Deleting file in session {} → {}", sessionId, path);
        service.deleteFile(sessionId, principal.user().getId(), path);
        log.info("File deleted: {}", path);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/sessions/{sessionId}/files/rename")
    @Operation(summary = "Rename or move a remote file / directory")
    public ResponseEntity<Void> renameFile(
            @PathVariable String sessionId,
            @Valid @RequestBody RenameRequest request,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        log.info("Renaming file in session {} → {} → {}", sessionId, request.getRemotePath(), request.getNewPath());
        service.renameFile(sessionId, principal.user().getId(), request.getRemotePath(), request.getNewPath());
        log.info("File renamed successfully");
        return ResponseEntity.ok().build();
    }

    @PostMapping("/sessions/{sessionId}/directories")
    @Operation(summary = "Create a remote directory")
    public ResponseEntity<String> createDirectory(
            @PathVariable String sessionId,
            @RequestParam String path,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        log.info("Creating directory in session {} → {}", sessionId, path);
        service.createDirectory(sessionId, principal.user().getId(), path);
        log.info("Directory created: {}", path);
        return new ResponseEntity<>("Directory created: " + path, HttpStatus.CREATED);
    }

    // File transfer endpoints

    @GetMapping("/sessions/{sessionId}/files/download")
    @Operation(
            summary = "Stream-download a remote file",
            description = "Streams the remote file directly to the HTTP response. No buffering on the server.",
            responses = {
                @ApiResponse(responseCode = "200", description = "File stream"),
                @ApiResponse(responseCode = "502", description = "Remote read error", content = @Content)
            })
    public ResponseEntity<StreamingResponseBody> downloadFile(
            @PathVariable String sessionId,
            @RequestParam String path,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        String decodedPath = URLDecoder.decode(path, StandardCharsets.UTF_8);
        Path filePath = Paths.get(decodedPath);
        Path fileNamePath = filePath.getFileName();
        if (fileNamePath == null) {
            throw new IllegalArgumentException("Cannot download a root or directory path: " + decodedPath);
        }
        String filename = fileNamePath.toString();

        log.info("Starting download in session {} → {}", sessionId, decodedPath);
        StreamingResponseBody stream =
                service.downloadFile(sessionId, principal.user().getId(), decodedPath);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(stream);
    }

    @PostMapping(value = "/sessions/{sessionId}/files/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Stream-upload a file to the remote host",
            description = "Uploads a file to the given remote path. Returns a transfer ID for progress tracking.",
            responses = {
                @ApiResponse(responseCode = "200", description = "Upload complete; returns transferId"),
                @ApiResponse(responseCode = "502", description = "Remote write error", content = @Content)
            })
    public ResponseEntity<String> uploadFile(
            @PathVariable String sessionId,
            @RequestParam String path,
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        log.info("Starting upload in session {} → {} (size: {} bytes)", sessionId, path, file.getSize());
        String transferId = service.uploadFile(sessionId, principal.user().getId(), path, file);
        log.info("Upload started with transfer ID: {}", transferId);
        return ResponseEntity.ok(transferId);
    }

    // Transfer progress tracking

    @GetMapping("/sessions/{sessionId}/transfers")
    @Operation(summary = "List all transfers for a session")
    public ResponseEntity<List<TransferStatusResponse>> getTransfers(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        log.debug("Fetching transfers for session {}", sessionId);
        List<TransferStatusResponse> transfers =
                service.getTransfers(sessionId, principal.user().getId());
        log.debug("Found {} transfers", transfers.size());
        return ResponseEntity.ok(transfers);
    }

    @GetMapping("/sessions/{sessionId}/transfers/{transferId}")
    @Operation(summary = "Get progress of a single transfer")
    public ResponseEntity<TransferStatusResponse> getTransfer(
            @PathVariable String sessionId,
            @PathVariable String transferId,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        log.debug("Fetching transfer {} status", transferId);
        TransferStatusResponse transfer =
                service.getTransfer(sessionId, principal.user().getId(), transferId);
        log.debug("Transfer {} is at {}%", transferId, transfer.getProgressPercent());
        return ResponseEntity.ok(transfer);
    }
}
