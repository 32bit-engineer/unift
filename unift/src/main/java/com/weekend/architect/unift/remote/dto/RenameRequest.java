package com.weekend.architect.unift.remote.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Request body for file rename / move operations. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RenameRequest {

    @NotBlank(message = "remotePath is required")
    private String remotePath;

    @NotBlank(message = "newPath is required")
    private String newPath;
}
