package com.weekend.architect.unift;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.weekend.architect.unift.integration.config.IntegrationTestBase;
import org.junit.jupiter.api.Test;

/**
 * Boot smoke test for the full UniFT application context.
 *
 * <p>Why this extends {@link IntegrationTestBase}: the application requires external infrastructure
 * (PostgreSQL, Redis, Kafka) even for a simple context boot. Reusing the shared integration-test
 * container wiring keeps this smoke test aligned with the rest of the suite and avoids unresolved
 * datasource placeholders such as {@code ${DB_URL}}.
 */
class UniFtApplicationTests extends IntegrationTestBase {

    @Test
    void contextLoads() {
        assertNotNull(mockMvc);
        assertNotNull(objectMapper);
    }
}
