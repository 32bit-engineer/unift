package com.weekend.architect.unift.auth.service;

import com.weekend.architect.unift.auth.config.JwtConfig;
import com.weekend.architect.unift.auth.dto.AuthResponse;
import com.weekend.architect.unift.auth.dto.LoginRequest;
import com.weekend.architect.unift.auth.dto.RefreshTokenRequest;
import com.weekend.architect.unift.auth.dto.RegisterRequest;
import com.weekend.architect.unift.auth.model.RefreshToken;
import com.weekend.architect.unift.auth.model.User;
import com.weekend.architect.unift.auth.repository.RefreshTokenRepository;
import com.weekend.architect.unift.auth.repository.UserRepository;
import com.weekend.architect.unift.exception.AccountLockedException;
import com.weekend.architect.unift.exception.InvalidCredentialsException;
import com.weekend.architect.unift.exception.TokenInvalidException;
import com.weekend.architect.unift.exception.UserAlreadyExistsException;
import com.weekend.architect.unift.utils.UuidUtils;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCK_DURATION_MINUTES = 15;

    private final JwtConfig jwtConfig;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenRepository refreshTokenRepository;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new UserAlreadyExistsException("Username '" + request.getUsername() + "' is already taken");
        }
        if (request.getEmail() != null
                && !request.getEmail().isBlank()
                && userRepository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("Email '" + request.getEmail() + "' is already registered");
        }

        User user = User.builder()
                .id(UuidUtils.uuidVersion7())
                .username(request.getUsername())
                .password(passwordEncoder.encode(request.getPassword()))
                .role("USER")
                .email(request.getEmail())
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .phoneNumber(request.getPhoneNumber())
                .active(true)
                .build();

        userRepository.save(user);
        return buildAuthResponse(user, null);
    }

    public AuthResponse login(LoginRequest request, String deviceHint) {
        User user = userRepository
                .findByUsernameOrEmail(request.getUsername())
                .orElseThrow(() -> new InvalidCredentialsException("Invalid username or password"));

        if (!user.isActive()) {
            throw new InvalidCredentialsException("Account is disabled. Please contact support.");
        }

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(OffsetDateTime.now())) {
            throw new AccountLockedException(
                    "Account is locked until " + user.getLockedUntil() + ". Too many failed login attempts.");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            handleFailedAttempt(user);
            throw new InvalidCredentialsException("Invalid username or password");
        }

        // Successful login — reset counters and update last login
        userRepository.resetLoginState(user.getId());
        userRepository.updateLastLogin(user.getId());

        return buildAuthResponse(user, deviceHint);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        String hash = jwtService.hashToken(request.getRefreshToken());

        RefreshToken stored = refreshTokenRepository
                .findByTokenHash(hash)
                .orElseThrow(() -> new TokenInvalidException("Refresh token not found"));

        if (stored.getRevokedAt() != null) {
            throw new TokenInvalidException("Refresh token has been revoked");
        }
        if (stored.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new TokenInvalidException("Refresh token has expired");
        }

        // Rotate: revoke the current token and issue a fresh pair
        refreshTokenRepository.revokeByTokenHash(hash);

        User user = userRepository
                .findById(stored.getUserId())
                .orElseThrow(() -> new TokenInvalidException("Associated user not found"));

        return buildAuthResponse(user, stored.getDeviceHint());
    }

    public void logout(RefreshTokenRequest request) {
        String hash = jwtService.hashToken(request.getRefreshToken());
        refreshTokenRepository.revokeByTokenHash(hash);
    }

    private void handleFailedAttempt(User user) {
        userRepository.incrementFailedLoginAttempts(user.getId());
        int newCount = user.getFailedLoginAttempts() + 1;
        if (newCount >= MAX_FAILED_ATTEMPTS) {
            OffsetDateTime lockUntil = OffsetDateTime.now().plusMinutes(LOCK_DURATION_MINUTES);
            userRepository.lockAccount(user.getId(), lockUntil);
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
