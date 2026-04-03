package com.weekend.architect.unift.integration.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Shared base for all HTTP-layer integration tests.
 *
 * <p>Lifecycle:
 *
 * <ul>
 *   <li>PostgreSQL (Testcontainers) — single container, started once per JVM run via static block.
 *   <li>Redis (Testcontainers) — same singleton strategy.
 *   <li>Kafka — Apache Kafka in-process via {@code @EmbeddedKafka}; broker address injected into
 *       {@code KAFKA_BOOTSTRAP_SERVERS} which the application YAML resolves.
 * </ul>
 *
 * <p>Spring context is shared and cached across all subclasses (same context key), so the
 * containers start exactly once per test-suite run.
 *
 * <p>Rate limiting is disabled in {@code test/resources/application.yaml} so tests are never
 * throttled.
 */
@SpringBootTest
@AutoConfigureMockMvc
@EmbeddedKafka(partitions = 1, bootstrapServersProperty = "KAFKA_BOOTSTRAP_SERVERS")
public abstract class IntegrationTestBase {

    // --- Infrastructure containers (singleton for the full test suite) --------

    @SuppressWarnings({"resource"})
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("unift_test")
            .withUsername("test")
            .withPassword("test");

    @SuppressWarnings({"resource"})
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    static {
        POSTGRES.start();
        REDIS.start();
    }

    @DynamicPropertySource
    static void configureContainerProperties(DynamicPropertyRegistry registry) {
        registry.add("DB_URL", POSTGRES::getJdbcUrl);
        registry.add("DB_USERNAME", POSTGRES::getUsername);
        registry.add("DB_PASSWORD", POSTGRES::getPassword);
        registry.add("REDIS_HOST", REDIS::getHost);
        registry.add("REDIS_PORT", () -> String.valueOf(REDIS.getMappedPort(6379)));
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;
}
