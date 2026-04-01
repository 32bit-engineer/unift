package com.weekend.architect.unift.remote.docker;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Data transfer objects for Docker container management. All data is collected via the Docker
 * Engine API accessed through an SSH tunnel to the remote host's Docker daemon socket.
 */
public final class DockerModels {

    private DockerModels() {}

    // -- System Info & Overview --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DockerSystemInfo {
        private boolean available;
        private String version;
        private String apiVersion;
        private String os;
        private String arch;
        private int totalContainers;
        private int runningContainers;
        private int stoppedContainers;
        private int pausedContainers;
        private int totalImages;
        private long memoryTotal;
        private int cpus;
        private String storageDriver;
        private String dockerRootDir;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DockerOverview {
        private DockerSystemInfo info;
        private List<DockerContainer> runningContainers;
        private List<ContainerStats> stats;
    }

    // -- Containers --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DockerContainer {
        private String id;
        private String name;
        private String image;
        private String imageId;
        private String state;
        private String status;
        private List<String> ports;
        private String createdAt;
        private Long sizeRw;
        private Long sizeRootFs;
        private List<String> networks;
        private String command;
        private Map<String, String> labels;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ContainerDetail {
        private String id;
        private String name;
        private String image;
        private String state;
        private String status;
        private List<String> ports;
        private List<String> env;
        private List<String> mounts;
        private Map<String, Object> networkSettings;
        private String restartPolicy;
        private String platform;
        private String command;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContainerPage {
        private List<DockerContainer> containers;
        private int total;
        private int page;
        private int pageSize;
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

    // -- Container Creation --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateContainerRequest {
        private String name;

        @NotBlank(message = "Image is required")
        private String image;

        private List<String> env;
        private Map<String, String> ports;
        private Map<String, String> volumes;
        private List<String> command;
        private String restartPolicy;
        private String networkMode;
        private Map<String, String> labels;
        private Long memoryLimit;
        private Integer cpuShares;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateContainerResponse {
        private String id;
        private List<String> warnings;
    }

    // -- Images --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DockerImage {
        private String id;
        private List<String> repoTags;
        private long size;
        private String created;
        private Map<String, String> labels;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImagePage {
        private List<DockerImage> images;
        private int total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PullImageRequest {
        private String repository;
        private String tag;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PullImageProgress {
        private String status;
        private String progress;
        private String id;
    }

    // -- Stats --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ContainerStats {
        private String containerId;
        private String name;
        private double cpuPercent;
        private long memoryUsage;
        private long memoryLimit;
        private double memoryPercent;
        private long networkRx;
        private long networkTx;
        private long blockRead;
        private long blockWrite;
        private int pids;
    }

    // -- Networks --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DockerNetwork {
        private String id;
        private String name;
        private String driver;
        private String scope;
        private boolean internal;
        private Map<String, String> containers;
        private Map<String, Object> ipam;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateNetworkRequest {
        private String name;
        private String driver;
    }

    // -- Volumes --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class DockerVolume {
        private String name;
        private String driver;
        private String mountpoint;
        private Map<String, String> labels;
        private String scope;
        private String createdAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateVolumeRequest {
        private String name;
        private String driver;
        private Map<String, String> labels;
    }

    // -- Compose --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ComposeProject {
        private String name;
        private String status;
        private String configFiles;
        private int services;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ComposeServiceDef {
        private String name;
        private String image;
        private List<String> ports;
        private Map<String, String> environment;
        private List<String> volumes;
        private List<String> networks;
        private List<String> dependsOn;
        private String restart;
        private String command;
        private Map<String, String> labels;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ComposeFileRequest {
        private String projectName;
        private List<ComposeServiceDef> services;
    }

    // -- Exec --

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExecCreateRequest {
        @NotBlank(message = "Container ID is required")
        private String containerId;

        @NotEmpty(message = "Command must not be empty")
        private List<String> command;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExecStartResult {
        private String output;
        private int exitCode;
    }
}
