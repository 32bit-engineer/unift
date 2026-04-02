package com.weekend.architect.unift.integration.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weekend.architect.unift.auth.dto.LoginRequest;
import com.weekend.architect.unift.auth.dto.RegisterRequest;
import com.weekend.architect.unift.utils.UuidUtils;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Test utility for acquiring JWT tokens without calling service-layer code directly.
 *
 * <p>Every helper method goes through the real HTTP stack (MockMvc), so the full filter chain (JWT
 * filter, validation, security) is exercised even during setup.
 */
public class TestAuthHelper {

    private static final String REGISTER_URL = "/api/auth/register";
    private static final String LOGIN_URL = "/api/auth/login";

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;

    public TestAuthHelper(MockMvc mockMvc, ObjectMapper objectMapper) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
    }

    /** Generates a username that is unique across the test run to prevent conflicts. */
    public String uniqueUsername() {
        return "user_" + UuidUtils.uuidVersion7();
    }

    /**
     * Registers a new user and returns the token pair from the 201 response. The email is
     * auto-generated as {@code username@test.com}.
     */
    public AuthTokens register(String username, String password) throws Exception {
        RegisterRequest request = buildRegisterRequest(username, password);
        MvcResult result = mockMvc.perform(post(REGISTER_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn();
        return parseTokens(result);
    }

    /** Logs in an existing user and returns the token pair. */
    public AuthTokens login(String username, String password) throws Exception {
        LoginRequest request = buildLoginRequest(username, password);
        MvcResult result = mockMvc.perform(post(LOGIN_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn();
        return parseTokens(result);
    }

    /** Convenience: registers and immediately returns a ready-to-use token pair. */
    public AuthTokens registerAndGetTokens(String username, String password) throws Exception {
        return register(username, password);
    }

    // --- private helpers ---

    private RegisterRequest buildRegisterRequest(String username, String password) {
        RegisterRequest r = new RegisterRequest();
        r.setUsername(username);
        r.setPassword(password);
        r.setEmail(username + "@test.com");
        return r;
    }

    private LoginRequest buildLoginRequest(String username, String password) {
        LoginRequest r = new LoginRequest();
        r.setUsername(username);
        r.setPassword(password);
        return r;
    }

    private AuthTokens parseTokens(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        JsonNode node = objectMapper.readTree(body);
        String accessToken = node.get("access_token").asText();
        String refreshToken = node.get("refresh_token").asText();
        return new AuthTokens(accessToken, refreshToken);
    }

    /**
     * Immutable value object holding an access + refresh token pair. {@link #bearer()} produces the
     * {@code Authorization: Bearer …} header value.
     */
    public record AuthTokens(String accessToken, String refreshToken) {
        public String bearer() {
            return "Bearer " + accessToken;
        }
    }
}
