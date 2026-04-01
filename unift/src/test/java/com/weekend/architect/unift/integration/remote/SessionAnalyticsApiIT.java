package com.weekend.architect.unift.integration.remote;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
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
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Integration tests for the session analytics endpoints:
 *
 * <ul>
 *   <li>{@code GET /api/remote/sessions/{id}/analytics} — live snapshot
 *   <li>{@code GET /api/remote/sessions/{id}/analytics/history} — historical snapshots
 * </ul>
 *
 * <p>A single MockSftpServer is started once per class. SSH exec-based probes (latency, system
 * metrics) will fail gracefully because the mock server does not expose a shell — the service falls
 * back to {@code unavailable} sentinel values, so the response is still HTTP 200 with a well-formed
 * payload.
 *
 * <p>Each test that mutates shared state (open/close) creates its own isolated user to prevent
 * interference.
 */
@DisplayName("Session Analytics API")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SessionAnalyticsApiIT extends IntegrationTestBase {

    private static final String SESSIONS = "/api/remote/sessions";
    private static final String ANALYTICS = "/analytics";
    private static final String HISTORY = "/analytics/history";
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
    @DisplayName("GET /analytics → 200 with full snapshot structure for an active session")
    void getAnalytics_happyPath() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(get(sessionPath(sessionId) + ANALYTICS).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.sessionId").value(sessionId))
                    .andExpect(jsonPath("$.host").value(sftpServer.getHost()))
                    .andExpect(jsonPath("$.state").value("ACTIVE"))
                    .andExpect(jsonPath("$.sessionDurationSeconds", greaterThanOrEqualTo(0)))
                    .andExpect(jsonPath("$.sessionDurationFormatted", notNullValue()))
                    .andExpect(jsonPath("$.throughput", notNullValue()))
                    .andExpect(jsonPath("$.generatedAt", notNullValue()));
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics → 401 when no JWT is provided")
    void getAnalytics_unauthenticated() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(get(sessionPath(sessionId) + ANALYTICS)).andExpect(status().isUnauthorized());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics → 404 when session ID does not exist")
    void getAnalytics_sessionNotFound() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);

        mockMvc.perform(get(sessionPath("nonexistent-session-id") + ANALYTICS)
                        .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /analytics → 403 when session belongs to a different user")
    void getAnalytics_crossUserForbidden() throws Exception {
        AuthTokens userA = auth.register(auth.uniqueUsername(), PASSWORD);
        AuthTokens userB = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(userA.bearer());

        try {
            mockMvc.perform(get(sessionPath(sessionId) + ANALYTICS).header(HttpHeaders.AUTHORIZATION, userB.bearer()))
                    .andExpect(status().isForbidden());
        } finally {
            closeSession(sessionId, userA.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics/history → 200 with empty list when no snapshots have been captured")
    void getAnalyticsHistory_emptyInitially() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(get(sessionPath(sessionId) + HISTORY).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.sessionId").value(sessionId))
                    .andExpect(jsonPath("$.count").value(0))
                    .andExpect(jsonPath("$.snapshots").isArray());
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics/history → 200 returns saved snapshot after live analytics is called")
    void getAnalyticsHistory_afterSnapshot_containsEntry() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            // Trigger a live analytics call — this persists one snapshot
            mockMvc.perform(get(sessionPath(sessionId) + ANALYTICS).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk());

            // History should now contain exactly one entry
            mockMvc.perform(get(sessionPath(sessionId) + HISTORY).header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.count").value(1))
                    .andExpect(jsonPath("$.snapshots[0].sessionId").value(sessionId))
                    .andExpect(jsonPath("$.snapshots[0].state").value("ACTIVE"));
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics/history → 200 respects the limit query parameter")
    void getAnalyticsHistory_limitParam() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            // Capture 3 snapshots by calling the live endpoint 3 times
            for (int i = 0; i < 3; i++) {
                mockMvc.perform(get(sessionPath(sessionId) + ANALYTICS)
                                .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                        .andExpect(status().isOk());
            }

            // Request only the most recent 2
            mockMvc.perform(get(sessionPath(sessionId) + HISTORY)
                            .param("limit", "2")
                            .header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.count").value(2));
        } finally {
            closeSession(sessionId, tokens.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics/history → 200 does not return snapshots belonging to a different user's" + " session")
    void getAnalyticsHistory_crossUserIsolation() throws Exception {
        AuthTokens userA = auth.register(auth.uniqueUsername(), PASSWORD);
        AuthTokens userB = auth.register(auth.uniqueUsername(), PASSWORD);

        String sessionA = openSession(userA.bearer());
        String sessionB = openSession(userB.bearer());

        try {
            // userA captures a snapshot
            mockMvc.perform(get(sessionPath(sessionA) + ANALYTICS).header(HttpHeaders.AUTHORIZATION, userA.bearer()))
                    .andExpect(status().isOk());

            // userB queries history for sessionA — should get 0 results (ownership filter
            // at DB level)
            mockMvc.perform(get(sessionPath(sessionA) + HISTORY).header(HttpHeaders.AUTHORIZATION, userB.bearer()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.count").value(0));
        } finally {
            closeSession(sessionA, userA.bearer());
            closeSession(sessionB, userB.bearer());
        }
    }

    @Test
    @DisplayName("GET /analytics/history → 401 when no JWT is provided")
    void getAnalyticsHistory_unauthenticated() throws Exception {
        AuthTokens tokens = auth.register(auth.uniqueUsername(), PASSWORD);
        String sessionId = openSession(tokens.bearer());

        try {
            mockMvc.perform(get(sessionPath(sessionId) + HISTORY)).andExpect(status().isUnauthorized());
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

    private String sessionPath(String sessionId) {
        return SESSIONS + "/" + sessionId;
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
