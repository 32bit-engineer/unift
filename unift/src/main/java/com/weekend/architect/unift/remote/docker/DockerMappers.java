package com.weekend.architect.unift.remote.docker;

import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.ContainerPort;
import com.github.dockerjava.api.model.Image;
import com.github.dockerjava.api.model.Info;
import com.github.dockerjava.api.model.Network;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Package-private utility converting docker-java SDK models to {@link DockerModels} DTOs.
 * Stateless helper — all methods are static.
 */
final class DockerMappers {

    private DockerMappers() {}

    static DockerModels.DockerSystemInfo toSystemInfo(Info info) {
        return DockerModels.DockerSystemInfo.builder()
                .available(true)
                .version(info.getServerVersion())
                .apiVersion("")
                .os(info.getOperatingSystem())
                .arch(info.getArchitecture())
                .totalContainers(info.getContainers() != null ? info.getContainers() : 0)
                .runningContainers(info.getContainersRunning() != null ? info.getContainersRunning() : 0)
                .stoppedContainers(info.getContainersStopped() != null ? info.getContainersStopped() : 0)
                .pausedContainers(info.getContainersPaused() != null ? info.getContainersPaused() : 0)
                .totalImages(info.getImages() != null ? info.getImages() : 0)
                .memoryTotal(info.getMemTotal() != null ? info.getMemTotal() : 0)
                .cpus(info.getNCPU() != null ? info.getNCPU() : 0)
                .storageDriver(info.getDriver() != null ? info.getDriver() : "")
                .dockerRootDir(info.getDockerRootDir() != null ? info.getDockerRootDir() : "")
                .build();
    }

    static DockerModels.DockerContainer toContainer(Container c) {
        String name = c.getNames() != null && c.getNames().length > 0
                ? c.getNames()[0].replaceFirst("^/", "") : "";
        List<String> nets = c.getNetworkSettings() != null && c.getNetworkSettings().getNetworks() != null
                ? new ArrayList<>(c.getNetworkSettings().getNetworks().keySet()) : List.of();
        return DockerModels.DockerContainer.builder()
                .id(c.getId()).name(name).image(c.getImage()).imageId(c.getImageId())
                .state(c.getState()).status(c.getStatus())
                .ports(toPorts(c.getPorts()))
                .createdAt(Instant.ofEpochSecond(c.getCreated()).toString())
                .sizeRw(c.getSizeRw()).sizeRootFs(c.getSizeRootFs())
                .networks(nets).command(c.getCommand())
                .labels(c.getLabels() != null ? c.getLabels() : Map.of())
                .build();
    }

    static DockerModels.ContainerDetail toContainerDetail(InspectContainerResponse r) {
        String state = r.getState() != null && r.getState().getStatus() != null
                ? r.getState().getStatus() : "unknown";
        List<String> env = r.getConfig() != null && r.getConfig().getEnv() != null
                ? Arrays.asList(r.getConfig().getEnv()) : List.of();
        List<String> mounts = r.getMounts() != null
                ? r.getMounts().stream().map(m -> m.getSource() + ":" + m.getDestination()).toList()
                : List.of();
        String restartPolicy = r.getHostConfig() != null && r.getHostConfig().getRestartPolicy() != null
                ? r.getHostConfig().getRestartPolicy().getName() : "";
        return DockerModels.ContainerDetail.builder()
                .id(r.getId())
                .name(r.getName() != null ? r.getName().replaceFirst("^/", "") : "")
                .image(r.getConfig() != null ? r.getConfig().getImage() : "")
                .state(state).status(r.getState() != null ? r.getState().getStatus() : "")
                .env(env).mounts(mounts).restartPolicy(restartPolicy)
                .platform(r.getPlatform() != null ? r.getPlatform() : "")
                .command(r.getConfig() != null && r.getConfig().getCmd() != null
                        ? String.join(" ", r.getConfig().getCmd()) : "")
                .build();
    }

    static DockerModels.DockerImage toImage(Image img) {
        return DockerModels.DockerImage.builder()
                .id(img.getId())
                .repoTags(img.getRepoTags() != null ? Arrays.asList(img.getRepoTags()) : List.of())
                .size(img.getSize() != null ? img.getSize() : 0)
                .created(img.getCreated() != null ? Instant.ofEpochSecond(img.getCreated()).toString() : "")
                .labels(img.getLabels() != null ? img.getLabels() : Map.of())
                .build();
    }

    static DockerModels.DockerNetwork toNetwork(Network n) {
        Map<String, String> containers = new LinkedHashMap<>();
        if (n.getContainers() != null) {
            n.getContainers().forEach((id, info) -> containers.put(id,
                    info.getIpv4Address() != null ? info.getIpv4Address() : ""));
        }
        return DockerModels.DockerNetwork.builder()
                .id(n.getId()).name(n.getName()).driver(n.getDriver())
                .scope(n.getScope()).internal(Boolean.TRUE.equals(n.getInternal())).containers(containers)
                .build();
    }

    static DockerModels.DockerVolume toVolume(com.github.dockerjava.api.command.InspectVolumeResponse v) {
        return DockerModels.DockerVolume.builder()
                .name(v.getName()).driver(v.getDriver()).mountpoint(v.getMountpoint())
                .labels(v.getLabels() != null ? v.getLabels() : Map.of())
                .build();
    }

    static DockerModels.DockerVolume toVolume(com.github.dockerjava.api.command.CreateVolumeResponse v) {
        return DockerModels.DockerVolume.builder()
                .name(v.getName()).driver(v.getDriver()).mountpoint(v.getMountpoint())
                .labels(v.getLabels() != null ? v.getLabels() : Map.of())
                .build();
    }

    static List<String> toPorts(ContainerPort[] ports) {
        if (ports == null) return List.of();
        List<String> result = new ArrayList<>();
        for (ContainerPort p : ports) {
            StringBuilder sb = new StringBuilder();
            if (p.getIp() != null) sb.append(p.getIp()).append(":");
            if (p.getPublicPort() != null) sb.append(p.getPublicPort()).append("->");
            sb.append(p.getPrivatePort()).append("/").append(p.getType() != null ? p.getType() : "tcp");
            result.add(sb.toString());
        }
        return result;
    }
}
