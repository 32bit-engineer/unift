package com.weekend.architect.unift.integration.remote;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.weekend.architect.unift.integration.config.IntegrationTestBase;
import com.weekend.architect.unift.integration.support.MockSftpServer;
import com.weekend.architect.unift.integration.support.TestAuthHelper;
import com.weekend.architect.unift.integration.support.TestAuthHelper.AuthTokens;
import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SshAuthType;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Integration tests for remote session lifecycle and workspace management ({@code
 * /api/remote/sessions/**}).
 *
 * <p>An Apache MINA SSHD server is started once for the class so tests can exercise real SSH/SFTP
 * connections without Docker or an external host.
 *
 * <p>Tests that mutate shared state (e.g. session open/close) each create their own isolated user
 * so they cannot interfere with one another.
 */
@DisplayName("Remote Session API")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RemoteSessionApiIT extends IntegrationTestBase {

    private static final String SESSIONS = "/api/remote/sessions";
    private static final String PASSWORD = "P@ssw0rd!";

    private MockSftpServer sftpServer;
    private TestAuthHelper auth;

    @BeforeAll
    void startSftpServer() throws Exception {
        sftpServer = new MockSftpServer();
        sftpServer.start();
        auth = new TestAuthHelper(mockMvc, objectMapper);
    }

    @AfterAll
    void stopSftpServer() throws Exception {
        sftpServer.close();
    }

    @Test
    @DisplayName("POST /sessions → 201 with session ID for valid SSH credentials")
    void openSession_happyPath() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        mockMvc.perform(get(SESSIONS + "/" + sessionId).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value(sessionId));

        closeSession(sessionId, tokens.bearer());
    }

    @Test
    @DisplayName("POST /sessions → 502 when SSH credentials are wrong")
    void openSession_badCredentials() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);

        ConnectRequest body = ConnectRequest.builder()
                .protocol(ProtocolType.SSH_SFTP)
                .host(sftpServer.getHost())
                .port(sftpServer.getPort())
                .username(MockSftpServer.TEST_USER)
                .sshAuthType(SshAuthType.PASSWORD)
                .password("wrong-password")
                .strictHostKeyChecking(false)
                .build();

        mockMvc.perform(post(SESSIONS)
                        .header(HttpHeaders.AUTHORIZATION, tokens.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadGateway());
    }

    @Test
    @DisplayName("POST /sessions → 429 when the per-user session cap (5) is exceeded")
    void openSession_maxSessionsExceeded() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        List<String> opened = new ArrayList<>();

        try {
            for (int i = 0; i < 5; i++) {
                opened.add(openSession(tokens.bearer()));
            }
            mockMvc.perform(post(SESSIONS)
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(validConnectRequest())))
                    .andExpect(status().isTooManyRequests());
        } finally {
            for (String id : opened) {
                closeSession(id, tokens.bearer());
            }
        }
    }

    @Test
    @DisplayName("POST /sessions → 401 when no JWT is provided")
    void openSession_unauthenticated() throws Exception {
        mockMvc.perform(post(SESSIONS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validConnectRequest())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /sessions → 200 with empty list when user has no open sessions")
    void listSessions_empty() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);

        mockMvc.perform(get(SESSIONS).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("GET /sessions → 200 returns only sessions owned by the requesting user")
    void listSessions_returnsOnlyOwnedSessions() throws Exception {
        AuthTokens userA = auth.register(auth.uniqueUsername(), PASSWORD);
        AuthTokens userB = auth.register(auth.uniqueUsername(), PASSWORD);

        String sidA = openSession(userA.bearer());
        String sidB = openSession(userB.bearer());

        try {
            mockMvc.perform(get(SESSIONS).header(HttpHeaders.AUTHORIZATION, userA.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$", hasSize(1)))
                    .andExpect(jsonPath("$[0].sessionId").value(sidA));
        } finally {
            closeSession(sidA, userA.bearer());
            closeSession(sidB, userB.bearer());
        }
    }

    @Test
    @DisplayName("GET /sessions/{id} → 200 with session details for the session owner")
    void getSession_found() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(get(SESSIONS + "/" + sessionId).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.sessionId").value(sessionId))
                    .andExpect(jsonPath("$.host").value(sftpServer.getHost()))
                    .andExpect(jsonPath("$.state", notNullValue()));
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("GET /sessions/{id} → 404 when session ID does not exist")
    void getSession_notFound() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);

        mockMvc.perform(get(SESSIONS + "/nonexistent-session-id").header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /sessions/{id} → 403 when session belongs to a different user")
    void getSession_crossUserForbidden() throws Exception {
        AuthTokens userA = auth.register(auth.uniqueUsername(), PASSWORD);
        AuthTokens userB = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(userA.bearer());

        try {
            mockMvc.perform(get(SESSIONS + "/" + sessionId).header(HttpHeaders.AUTHORIZATION, userB.bearer()))
                    .andExpect(status().isForbidden());
        } finally {
            closeSession(sessionId, userA.bearer());
        }
    }

    @Test
    @DisplayName("DELETE /sessions/{id} → 204 when session is successfully closed")
    void closeSession_success() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        mockMvc.perform(delete(SESSIONS + "/" + sessionId).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isNoContent());

        // After close, GET should return 404
        mockMvc.perform(get(SESSIONS + "/" + sessionId).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("DELETE /sessions/{id} → 204 (idempotent) when session ID does not exist")
    void closeSession_notFound_isNoOp() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);

        mockMvc.perform(delete(SESSIONS + "/nonexistent-id").header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("GET /sessions/{id}/workspaces → 200 returns set containing 'ssh' by default")
    void listWorkspaces_defaultContainsSsh() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(get(SESSIONS + "/" + sessionId + "/workspaces")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@ == 'ssh')]").exists());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("POST /sessions/{id}/workspaces/docker → 200 and workspace is activated")
    void activateWorkspace_validType() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(post(SESSIONS + "/" + sessionId + "/workspaces/docker")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@ == 'docker')]").exists());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("POST /sessions/{id}/workspaces/{type} → 400 when type is not valid")
    void activateWorkspace_invalidType() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(post(SESSIONS + "/" + sessionId + "/workspaces/ftp")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isBadRequest());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("DELETE /sessions/{id}/workspaces/ssh → 400 (ssh workspace cannot be removed)")
    void deactivateWorkspace_sshIsNotRemovable() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(delete(SESSIONS + "/" + sessionId + "/workspaces/ssh")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isBadRequest());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("DELETE /sessions/{id}/workspaces/docker → 200 after docker was activated")
    void deactivateWorkspace_docker_afterActivation() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            // Activate first
            mockMvc.perform(post(SESSIONS + "/" + sessionId + "/workspaces/docker")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk());

            // Then deactivate
            mockMvc.perform(delete(SESSIONS + "/" + sessionId + "/workspaces/docker")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@ == 'docker')]").doesNotExist());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    private String openSession(String bearerToken) throws Exception {
        MvcResult result = mockMvc.perform(post(SESSIONS)
                        .header(HttpHeaders.AUTHORIZATION, bearerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validConnectRequest())))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("sessionId")
                .asText();
    }

    private void closeSession(String sessionId, String bearerToken) throws Exception {
        mockMvc.perform(delete(SESSIONS + "/" + sessionId).header(HttpHeaders.AUTHORIZATION, bearerToken))
                .andReturn();
    }

    private ConnectRequest validConnectRequest() {
        return ConnectRequest.builder()
                .protocol(ProtocolType.SSH_SFTP)
                .host(sftpServer.getHost())
                .port(sftpServer.getPort())
                .username(MockSftpServer.TEST_USER)
                .sshAuthType(SshAuthType.PASSWORD)
                .password(MockSftpServer.TEST_PASS)
                .strictHostKeyChecking(false)
                .build();
    }
}
