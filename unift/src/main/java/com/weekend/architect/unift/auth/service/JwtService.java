package com.weekend.architect.unift.auth.service;

import org.springframework.security.core.userdetails.UserDetails;

public interface JwtService {

    String generateAccessToken(UserDetails userDetails);

    String extractUsername(String token);

    boolean isAccessTokenValid(String token, UserDetails userDetails);

    String generateRawRefreshToken();

    String hashToken(String token);

    long getAccessTokenExpirationMs();
}
