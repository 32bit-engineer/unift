package com.weekend.architect.unift.remote.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request body for {@code POST /api/uploads/sessions}.
 *
 * <p>The caller must pre-compute the chunk layout (chunk size and count) before
 * creating the session.  A sensible default chunk size is 5 MB.
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class UploadSessionRequest {

    @NotBlank(message = "filename is required")
    private String filename;

    @Positive(message = "totalSize must be > 0")
    private long totalSize;

    @Positive(message = "chunkSize must be > 0")
    private int chunkSize;

    @Positive(message = "totalChunks must be > 0")
    private int totalChunks;

    @NotBlank(message = "destinationPath is required")
    private String destinationPath;
}
