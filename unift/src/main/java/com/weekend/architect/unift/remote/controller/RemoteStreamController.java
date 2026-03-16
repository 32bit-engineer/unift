package com.weekend.architect.unift.remote.controller;

import com.weekend.architect.unift.remote.service.RemoteStreamService;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * Dedicated controller for streaming remote file content over an established SSH/SFTP session.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/stream")
@Slf4j
@Tag(name = "Remote File Streaming", description = "Streaming file download over an existing SSH/SFTP session")
@SecurityRequirement(name = "BearerAuth")
public class RemoteStreamController {

    private final RemoteStreamService streamService;

    /**
     * Streams the content of a remote file directly to the HTTP response.
     *
     * <p>The SFTP connection used here is the <strong>same</strong> connection already
     * established via {@code POST /api/remote/sessions} — no new connection is opened.
     * File bytes are copied from the SFTP {@link InputStream} to the response output
     * stream in chunks by Spring MVC's async executor. The {@link InputStream} is always
     * closed after the transfer (or on error).
     */
    @GetMapping(value = "/sessions/{sessionId}/files", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    @Operation(
            summary = "Stream a remote file",
            description = "Downloads the content of a remote file chunk-by-chunk using StreamingResponseBody. "
                    + "Uses the existing established SSH/SFTP session — no new connection is opened. "
                    + "Spring MVC's async executor drains the SFTP InputStream into the HTTP response "
                    + "without buffering the full file in memory.",
            responses = {
                @ApiResponse(responseCode = "200", description = "Streaming file content"),
                @ApiResponse(responseCode = "400", description = "Path is a root or directory", content = @Content),
                @ApiResponse(responseCode = "404", description = "Session not found", content = @Content),
                @ApiResponse(
                        responseCode = "403",
                        description = "Session not owned by the current user",
                        content = @Content),
                @ApiResponse(responseCode = "502", description = "Remote read error", content = @Content)
            })
    public ResponseEntity<StreamingResponseBody> streamFile(
            @PathVariable String sessionId,
            @RequestParam String path,
            @AuthenticationPrincipal UniFtUserDetails principal) {

        String decodedPath = URLDecoder.decode(path, StandardCharsets.UTF_8);
        var fileNamePath = Paths.get(decodedPath).getFileName();
        if (fileNamePath == null) {
            throw new IllegalArgumentException("Cannot stream a root or directory path: " + decodedPath);
        }

        log.info("[stream] Streaming file in session {} → {}", sessionId, decodedPath);

        // Open the SFTP InputStream eagerly on the request thread (fast — just opens the channel).
        // Spring MVC's async executor will drain it to the response output stream on a separate thread.
        InputStream remoteStream =
                streamService.streamFile(sessionId, principal.user().getId(), decodedPath);

        StreamingResponseBody body = outputStream -> {
            try (InputStream is = remoteStream) {
                is.transferTo(outputStream);
                log.debug("[{}] ✓ Stream complete ← '{}'", sessionId, decodedPath);
            } catch (Exception e) {
                log.error("[{}] ❌ Stream error ← '{}': {}", sessionId, decodedPath, e.getMessage());
                throw e;
            }
        };

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileNamePath + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(body);
    }
}
