package com.weekend.architect.unift.auth.service.impl;

import com.weekend.architect.unift.auth.config.JwtConfig;
import com.weekend.architect.unift.auth.dto.AuthResponse;
import com.weekend.architect.unift.auth.dto.LoginRequest;
import com.weekend.architect.unift.auth.dto.RefreshTokenRequest;
import com.weekend.architect.unift.auth.dto.RegisterRequest;
import com.weekend.architect.unift.auth.model.RefreshToken;
import com.weekend.architect.unift.auth.model.User;
import com.weekend.architect.unift.auth.repository.RefreshTokenRepository;
import com.weekend.architect.unift.auth.repository.UserRepository;
import com.weekend.architect.unift.auth.service.AuthService;
import com.weekend.architect.unift.auth.service.JwtService;
import com.weekend.architect.unift.exception.AccountLockedException;
import com.weekend.architect.unift.exception.InvalidCredentialsException;
import com.weekend.architect.unift.exception.TokenInvalidException;
import com.weekend.architect.unift.exception.UserAlreadyExistsException;
import com.weekend.architect.unift.utils.UuidUtils;
import java.time.OffsetDateTime;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
public class AuthServiceImpl implements AuthService {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCK_DURATION_MINUTES = 15;

    private final JwtConfig jwtConfig;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenRepository refreshTokenRepository;

    /**
     * CPU-bound work executor — BCrypt hashing is computationally expensive.
     * Using a pool bounded to {@code availableProcessors()} ensures concurrent
     * login/register requests cannot saturate all CPU cores simultaneously.
     * Lifecycle managed by {@link com.weekend.architect.unift.common.PreTermination}.
     */
    private final ExecutorService platformThreadExecutor;

    public AuthServiceImpl(
            JwtConfig jwtConfig,
            JwtService jwtService,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            RefreshTokenRepository refreshTokenRepository,
            @Qualifier("platformThreadExecutor") ExecutorService platformThreadExecutor) {
        this.jwtConfig = jwtConfig;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokenRepository = refreshTokenRepository;
        this.platformThreadExecutor = platformThreadExecutor;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        log.info("New user registration attempt: {}", request.getUsername());
        if (userRepository.existsByUsername(request.getUsername())) {
            log.warn("Registration failed - username already exists: {}", request.getUsername());
            throw new UserAlreadyExistsException("Username '" + request.getUsername() + "' is already taken");
        }
        if (request.getEmail() != null
                && !request.getEmail().isBlank()
                && userRepository.existsByEmail(request.getEmail())) {
            log.warn("Registration failed - email already exists: {}", request.getEmail());
            throw new UserAlreadyExistsException("Email '" + request.getEmail() + "' is already registered");
        }

        User user = User.builder()
                .id(UuidUtils.uuidVersion7())
                .username(request.getUsername())
                .password(CompletableFuture.supplyAsync(
                                () -> passwordEncoder.encode(request.getPassword()), platformThreadExecutor)
                        .join())
                .role("USER")
                .email(request.getEmail())
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .phoneNumber(request.getPhoneNumber())
                .active(true)
                .build();

        userRepository.save(user);
        log.info("User registered successfully: {} (ID: {})", request.getUsername(), user.getId());
        return buildAuthResponse(user, null);
    }

    @Transactional
    public AuthResponse login(LoginRequest request, String deviceHint) {
        log.info("Login attempt: {} (device: {})", request.getUsername(), deviceHint);
        User user = userRepository.findByUsernameOrEmail(request.getUsername()).orElseThrow(() -> {
            log.warn("Login failed - user not found: {}", request.getUsername());
            return new InvalidCredentialsException("Invalid username or password");
        });

        if (!user.isActive()) {
            log.warn("Login failed - account disabled: {}", request.getUsername());
            throw new InvalidCredentialsException("Account is disabled. Please contact support.");
        }

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(OffsetDateTime.now())) {
            log.warn("Login failed - account locked until {}: {}", user.getLockedUntil(), request.getUsername());
            throw new AccountLockedException(
                    "Account is locked until " + user.getLockedUntil() + ". Too many failed login attempts.");
        }

        boolean passwordMatches = CompletableFuture.supplyAsync(
                        () -> passwordEncoder.matches(request.getPassword(), user.getPassword()),
                        platformThreadExecutor)
                .join();

        if (!passwordMatches) {
            log.warn("Login failed - invalid password for user: {}", request.getUsername());
            handleFailedAttempt(user);
            throw new InvalidCredentialsException("Invalid username or password");
        }

        // Successful login — reset counters and update last login
        userRepository.resetLoginState(user.getId());
        userRepository.updateLastLogin(user.getId());
        log.info("Login successful: {} (ID: {})", request.getUsername(), user.getId());

        return buildAuthResponse(user, deviceHint);
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        log.debug("Token refresh attempt");
        String hash = jwtService.hashToken(request.getRefreshToken());

        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash).orElseThrow(() -> {
            log.warn("Refresh failed - token not found");
            return new TokenInvalidException("Refresh token not found");
        });

        if (stored.getRevokedAt() != null) {
            log.warn("Refresh failed - token has been revoked");
            throw new TokenInvalidException("Refresh token has been revoked");
        }
        if (stored.getExpiresAt().isBefore(OffsetDateTime.now())) {
            log.warn("Refresh failed - token has expired");
            throw new TokenInvalidException("Refresh token has expired");
        }

        // Rotate: revoke the current token and issue a fresh pair
        refreshTokenRepository.revokeByTokenHash(hash);

        User user = userRepository.findById(stored.getUserId()).orElseThrow(() -> {
            log.warn("Refresh failed - user not found");
            return new TokenInvalidException("Associated user not found");
        });

        log.info("Token refreshed for user: {}", user.getId());
        return buildAuthResponse(user, stored.getDeviceHint());
    }

    public void logout(RefreshTokenRequest request) {
        log.info("User logout");
        String hash = jwtService.hashToken(request.getRefreshToken());
        refreshTokenRepository.revokeByTokenHash(hash);
        log.info("Logout successful");
    }

    private void handleFailedAttempt(User user) {
        userRepository.incrementFailedLoginAttempts(user.getId());
        int newCount = user.getFailedLoginAttempts() + 1;
        log.warn("Failed login attempt for user: {} (attempt {})", user.getUsername(), newCount);
        if (newCount >= MAX_FAILED_ATTEMPTS) {
            OffsetDateTime lockUntil = OffsetDateTime.now().plusMinutes(LOCK_DURATION_MINUTES);
            userRepository.lockAccount(user.getId(), lockUntil);
            log.warn(
                    "Account locked after {} failed attempts: {} (until {})",
                    MAX_FAILED_ATTEMPTS,
                    user.getUsername(),
                    lockUntil);
        }
    }

    private AuthResponse buildAuthResponse(User user, String deviceHint) {
        UserDetails principal = buildPrincipal(user);
        String accessToken = jwtService.generateAccessToken(principal);

        String rawRefreshToken = jwtService.generateRawRefreshToken();
        String refreshTokenHash = jwtService.hashToken(rawRefreshToken);

        OffsetDateTime now = OffsetDateTime.now();
        RefreshToken refreshToken = RefreshToken.builder()
                .id(UuidUtils.uuidVersion7())
                .userId(user.getId())
                .tokenHash(refreshTokenHash)
                .deviceHint(deviceHint)
                .issuedAt(now)
                .expiresAt(now.plusSeconds(jwtConfig.getRefreshTokenExpirationMs() / 1000))
                .build();

        refreshTokenRepository.save(refreshToken);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(rawRefreshToken)
                .expiresIn(jwtConfig.getAccessTokenExpirationMs() / 1000)
                .build();
    }

    private UserDetails buildPrincipal(User user) {
        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getUsername())
                .password(user.getPassword())
                .roles(user.getRole())
                .build();
    }
}
