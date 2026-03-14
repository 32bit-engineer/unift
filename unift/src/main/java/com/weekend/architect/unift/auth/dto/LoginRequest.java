package com.weekend.architect.unift.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Credentials for logging in")
public class LoginRequest {

    @NotBlank(message = "Username or email is required")
    @Schema(
            description = "Username or email address",
            example = "john_doe",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String username;

    @NotBlank(message = "Password is required")
    @Schema(description = "Account password", example = "s3cr3tP@ss", requiredMode = Schema.RequiredMode.REQUIRED)
    private String password;
}
