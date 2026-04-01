package com.weekend.architect.unift.integration.auth;

import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.weekend.architect.unift.auth.dto.LoginRequest;
import com.weekend.architect.unift.auth.dto.RefreshTokenRequest;
import com.weekend.architect.unift.auth.dto.RegisterRequest;
import com.weekend.architect.unift.integration.config.IntegrationTestBase;
import com.weekend.architect.unift.integration.support.TestAuthHelper;
import com.weekend.architect.unift.integration.support.TestAuthHelper.AuthTokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Integration tests for {@code /api/auth/**} endpoints.
 *
 * <p>Every test uses a unique username so that tests are independent and can run in any order
 * without conflicting on the UNIQUE constraint on {@code users.username}.
 *
 * <p>Happy paths, validation failures, duplicate-user conflicts, and invalid-token scenarios are
 * all covered.
 */
@DisplayName("Auth API")
class AuthApiIT extends IntegrationTestBase {

    private static final String REGISTER = "/api/auth/register";
    private static final String LOGIN = "/api/auth/login";
    private static final String REFRESH = "/api/auth/refresh";
    private static final String LOGOUT = "/api/auth/logout";
    private static final String PASSWORD = "P@ssw0rd!";

    private TestAuthHelper auth;

    @BeforeEach
    void setUp() {
        auth = new TestAuthHelper(mockMvc, objectMapper);
    }

    @Test
    @DisplayName("POST /register → 201 with token pair when payload is valid")
    void register_happyPath() throws Exception {
        String username = auth.uniqueUsername();
        RegisterRequest body = registerRequest(username, PASSWORD, username + "@test.com");

        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.access_token", not(emptyString())))
                .andExpect(jsonPath("$.refresh_token", not(emptyString())))
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.expires_in").value(notNullValue()));
    }

    @Test
    @DisplayName("POST /register → 409 when username already exists")
    void register_duplicateUsername() throws Exception {
        String username = auth.uniqueUsername();
        auth.register(username, PASSWORD);

        RegisterRequest dup = registerRequest(username, PASSWORD, "other_" + username + "@test.com");
        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dup)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    @DisplayName("POST /register → 409 when email already exists")
    void register_duplicateEmail() throws Exception {
        String email = auth.uniqueUsername() + "@shared.com";
        auth.register(auth.uniqueUsername(), PASSWORD);

        // Register first user with that email
        String firstUser = auth.uniqueUsername();
        RegisterRequest first = registerRequest(firstUser, PASSWORD, email);
        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(first)))
                .andExpect(status().isCreated());

        // Attempt to register second user with same email
        RegisterRequest dup = registerRequest(auth.uniqueUsername(), PASSWORD, email);
        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dup)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("POST /register → 400 when username is blank")
    void register_blankUsername() throws Exception {
        RegisterRequest body = registerRequest("", PASSWORD, "blank@test.com");

        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.username", notNullValue()));
    }

    @Test
    @DisplayName("POST /register → 400 when username is shorter than 3 characters")
    void register_usernameTooShort() throws Exception {
        RegisterRequest body = registerRequest("ab", PASSWORD, "short@test.com");

        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.username", notNullValue()));
    }

    @Test
    @DisplayName("POST /register → 400 when password is shorter than 8 characters")
    void register_passwordTooShort() throws Exception {
        RegisterRequest body = registerRequest(auth.uniqueUsername(), "short", "pw@test.com");

        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.password", notNullValue()));
    }

    @Test
    @DisplayName("POST /register → 400 when email format is invalid")
    void register_invalidEmail() throws Exception {
        RegisterRequest body = registerRequest(auth.uniqueUsername(), PASSWORD, "not-an-email");

        mockMvc.perform(post(REGISTER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.email", notNullValue()));
    }

    @Test
    @DisplayName("POST /login → 200 with token pair for valid credentials")
    void login_happyPath() throws Exception {
        String username = auth.uniqueUsername();
        auth.register(username, PASSWORD);

        LoginRequest body = loginRequest(username, PASSWORD);
        mockMvc.perform(post(LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token", not(emptyString())))
                .andExpect(jsonPath("$.refresh_token", not(emptyString())));
    }

    @Test
    @DisplayName("POST /login → 401 when password is wrong")
    void login_wrongPassword() throws Exception {
        String username = auth.uniqueUsername();
        auth.register(username, PASSWORD);

        mockMvc.perform(post(LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest(username, "WrongPass1!"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    @DisplayName("POST /login → 401 when username does not exist")
    void login_unknownUser() throws Exception {
        mockMvc.perform(post(LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest("ghost_user_zzz", PASSWORD))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /login → 400 when username is blank")
    void login_blankUsername() throws Exception {
        mockMvc.perform(post(LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest("", PASSWORD))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.username", notNullValue()));
    }

    @Test
    @DisplayName("POST /login → 400 when password is blank")
    void login_blankPassword() throws Exception {
        mockMvc.perform(post(LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest(auth.uniqueUsername(), ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.password", notNullValue()));
    }

    @Test
    @DisplayName("POST /refresh → 200 with new token pair for valid refresh token")
    void refresh_happyPath() throws Exception {
        String username = auth.uniqueUsername();
        AuthTokens tokens = auth.register(username, PASSWORD);

        RefreshTokenRequest body = refreshRequest(tokens.refreshToken());
        mockMvc.perform(post(REFRESH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token", not(emptyString())))
                .andExpect(jsonPath("$.refresh_token", not(emptyString())));
    }

    @Test
    @DisplayName("POST /refresh → 401 when refresh token is a random string (not in DB)")
    void refresh_invalidToken() throws Exception {
        mockMvc.perform(post(REFRESH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest("totally-invalid-token"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    @DisplayName("POST /refresh → 401 when refresh token has already been rotated (replay attack)")
    void refresh_revokedToken() throws Exception {
        String username = auth.uniqueUsername();
        AuthTokens tokens = auth.register(username, PASSWORD);

        // First refresh — rotates the token
        mockMvc.perform(post(REFRESH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest(tokens.refreshToken()))))
                .andExpect(status().isOk());

        // Second attempt with the original (now revoked) token
        mockMvc.perform(post(REFRESH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest(tokens.refreshToken()))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /refresh → 400 when refresh_token field is blank")
    void refresh_blankToken() throws Exception {
        mockMvc.perform(post(REFRESH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest(""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.refreshToken", notNullValue()));
    }

    @Test
    @DisplayName("POST /logout → 200 and revokes the refresh token")
    void logout_happyPath() throws Exception {
        String username = auth.uniqueUsername();
        AuthTokens tokens = auth.register(username, PASSWORD);

        mockMvc.perform(post(LOGOUT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest(tokens.refreshToken()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Logged out successfully"));

        // After logout, refresh with same token must fail
        mockMvc.perform(post(REFRESH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest(tokens.refreshToken()))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /logout → 400 when refresh_token field is blank")
    void logout_blankToken() throws Exception {
        mockMvc.perform(post(LOGOUT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(refreshRequest(""))))
                .andExpect(status().isBadRequest());
    }

    private RegisterRequest registerRequest(String username, String password, String email) {
        RegisterRequest r = new RegisterRequest();
        r.setUsername(username);
        r.setPassword(password);
        r.setEmail(email);
        return r;
    }

    private LoginRequest loginRequest(String username, String password) {
        LoginRequest r = new LoginRequest();
        r.setUsername(username);
        r.setPassword(password);
        return r;
    }

    private RefreshTokenRequest refreshRequest(String token) {
        RefreshTokenRequest r = new RefreshTokenRequest();
        r.setRefreshToken(token);
        return r;
    }
}
