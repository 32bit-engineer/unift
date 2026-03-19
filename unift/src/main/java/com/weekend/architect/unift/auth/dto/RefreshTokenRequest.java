package com.weekend.architect.unift.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Refresh token payload")
public class RefreshTokenRequest {

    @NotBlank(message = "Refresh token is required")
    @JsonProperty("refresh_token")
    @Schema(
            description = "The refresh_token value received from login or register",
            example = "aBcDeFgH....",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String refreshToken;
}
