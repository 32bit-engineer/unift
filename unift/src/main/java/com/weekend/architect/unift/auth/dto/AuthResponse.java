package com.weekend.architect.unift.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@Schema(description = "JWT token pair returned after successful authentication")
public class AuthResponse {

    @JsonProperty("access_token")
    @Schema(
            description = "Short-lived JWT access token (15 min). Send as Authorization: Bearer <token>",
            example = "eyJhbGciOiJIUzI1NiJ9...")
    private String accessToken;

    @JsonProperty("refresh_token")
    @Schema(
            description = "Long-lived opaque refresh token (7 days). Use /api/auth/refresh to rotate.",
            example = "dGhpcyBpcyBhIHJhbmRvbSByZWZyZXNo...")
    private String refreshToken;

    @JsonProperty("token_type")
    @Builder.Default
    @Schema(description = "Token type — always Bearer", example = "Bearer")
    private String tokenType = "Bearer";

    @JsonProperty("expires_in")
    @Schema(description = "Access token lifetime in seconds", example = "900")
    private long expiresIn;
}
