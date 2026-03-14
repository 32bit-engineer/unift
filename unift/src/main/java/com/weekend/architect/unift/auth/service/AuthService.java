package com.weekend.architect.unift.auth.service;

import com.weekend.architect.unift.auth.dto.AuthResponse;
import com.weekend.architect.unift.auth.dto.LoginRequest;
import com.weekend.architect.unift.auth.dto.RefreshTokenRequest;
import com.weekend.architect.unift.auth.dto.RegisterRequest;

public interface AuthService {

    AuthResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request, String deviceHint);

    AuthResponse refresh(RefreshTokenRequest request);

    void logout(RefreshTokenRequest request);
}
