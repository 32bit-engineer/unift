package com.weekend.architect.unift.remote.docker;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Data transfer objects for Docker container and image management.
 * All data is collected via {@code docker} CLI commands executed
 * over the existing SSH exec channel.
 */
public final class DockerModels {

    private DockerModels() {}

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DockerInfo {
        private boolean available;
        private String version;
        private int totalContainers;
        private int runningContainers;
        private int stoppedContainers;
        private int pausedContainers;
        private int totalImages;
        private String serverOs;
        private String storageDriver;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Container {
        @JsonProperty("ID")
        private String id;

        @JsonProperty("Names")
        private String names;

        @JsonProperty("Image")
        private String image;

        @JsonProperty("State")
        private String state;

        @JsonProperty("Status")
        private String status;

        @JsonProperty("Ports")
        private String ports;

        @JsonProperty("CreatedAt")
        private String createdAt;

        @JsonProperty("Size")
        private String size;

        @JsonProperty("Networks")
        private String networks;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContainerStats {
        private String containerId;
        private String name;
        private String cpuPercent;
        private String memoryUsage;
        private String memoryLimit;
        private String memoryPercent;
        private String networkIo;
        private String blockIo;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DockerImage {
        @JsonProperty("ID")
        private String id;

        @JsonProperty("Repository")
        private String repository;

        @JsonProperty("Tag")
        private String tag;

        @JsonProperty("Size")
        private String size;

        @JsonProperty("CreatedAt")
        private String createdAt;

        @JsonProperty("CreatedSince")
        private String createdSince;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DockerOverview {
        private DockerInfo info;
        private List<Container> runningContainers;
        private List<ContainerStats> stats;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContainerActionResult {
        private String containerId;
        private String action;
        private boolean success;
        private String message;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContainerPage {
        private List<Container> containers;
        private int total;
        private int page;
        private int pageSize;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImagePage {
        private List<DockerImage> images;
        private int total;
    }
}
