package com.weekend.architect.unift.auth.controller;

import com.weekend.architect.unift.auth.dto.AuthResponse;
import com.weekend.architect.unift.auth.dto.LoginRequest;
import com.weekend.architect.unift.auth.dto.RefreshTokenRequest;
import com.weekend.architect.unift.auth.dto.RegisterRequest;
import com.weekend.architect.unift.auth.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Register, login, token refresh and logout")
@SecurityRequirements // no Bearer token required for any endpoint in this controller
public class AuthController {

    private final AuthService authService;

    /**
     * POST /api/auth/register
     * Create a new account and return a token pair.
     */
    @PostMapping("/register")
    @Operation(
            summary = "Create a new account",
            description = "Registers a new user and immediately returns a JWT access token + refresh token pair.",
            responses = {
                @ApiResponse(
                        responseCode = "201",
                        description = "Account created",
                        content = @Content(schema = @Schema(implementation = AuthResponse.class))),
                @ApiResponse(responseCode = "400", description = "Validation error", content = @Content),
                @ApiResponse(responseCode = "409", description = "Username or email already exists", content = @Content)
            })
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    /**
     * POST /api/auth/login
     * Authenticate with username (or email) + password and return a token pair.
     */
    @PostMapping("/login")
    @Operation(
            summary = "Login",
            description =
                    "Authenticate with username (or email) and password. Returns a JWT access token and a refresh token.",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Login successful",
                        content = @Content(schema = @Schema(implementation = AuthResponse.class))),
                @ApiResponse(responseCode = "401", description = "Invalid credentials", content = @Content),
                @ApiResponse(
                        responseCode = "423",
                        description = "Account locked — too many failed attempts",
                        content = @Content)
            })
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String deviceHint = httpRequest.getHeader("User-Agent");
        return ResponseEntity.ok(authService.login(request, deviceHint));
    }

    /**
     * POST /api/auth/refresh
     * Exchange a valid refresh token for a new access token (token rotation).
     */
    @PostMapping("/refresh")
    @Operation(
            summary = "Refresh access token",
            description =
                    "Exchange a valid refresh token for a new access token. The old refresh token is rotated (revoked) and a brand new one is returned.",
            responses = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Token refreshed",
                        content = @Content(schema = @Schema(implementation = AuthResponse.class))),
                @ApiResponse(
                        responseCode = "401",
                        description = "Refresh token invalid, expired or revoked",
                        content = @Content)
            })
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(authService.refresh(request));
    }

    /**
     * POST /api/auth/logout
     * Revoke the provided refresh token.
     */
    @PostMapping("/logout")
    @Operation(
            summary = "Logout",
            description = "Revoke the provided refresh token. The access token expires on its own (15 min TTL).",
            responses = {
                @ApiResponse(responseCode = "200", description = "Logged out successfully"),
                @ApiResponse(responseCode = "400", description = "Refresh token is required", content = @Content)
            })
    public ResponseEntity<Map<String, String>> logout(@Valid @RequestBody RefreshTokenRequest request) {
        authService.logout(request);
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }
}
