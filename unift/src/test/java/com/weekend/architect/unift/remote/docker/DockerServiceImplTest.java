package com.weekend.architect.unift.remote.docker;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.dockerjava.api.model.Statistics;
import java.io.IOException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DockerServiceImplTest {

        private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("hasUsableCpuBaseline rejects first-frame stats without a previous CPU sample")
        void hasUsableCpuBaseline_rejectsMissingPreviousSample() throws IOException {
                Statistics stats = readStats(
                                """
                                {
                                    "cpu_stats": {
                                        "cpu_usage": {
                                            "total_usage": 1500000
                                        },
                                        "system_cpu_usage": 10000000
                                    },
                                    "precpu_stats": {
                                        "cpu_usage": {
                                            "total_usage": 0
                                        },
                                        "system_cpu_usage": 0
                                    }
                                }
                                """);

        assertFalse(DockerServiceImpl.hasUsableCpuBaseline(stats));
    }

    @Test
    @DisplayName("hasUsableCpuBaseline accepts stats once Docker provides a previous CPU sample")
        void hasUsableCpuBaseline_acceptsPreviousSample() throws IOException {
                Statistics stats = readStats(
                                """
                                {
                                    "cpu_stats": {
                                        "cpu_usage": {
                                            "total_usage": 2000000
                                        },
                                        "system_cpu_usage": 20000000
                                    },
                                    "precpu_stats": {
                                        "cpu_usage": {
                                            "total_usage": 1500000
                                        },
                                        "system_cpu_usage": 15000000
                                    }
                                }
                                """);

        assertTrue(DockerServiceImpl.hasUsableCpuBaseline(stats));
    }

        private Statistics readStats(String json) throws IOException {
                return objectMapper.readValue(json, Statistics.class);
        }
}