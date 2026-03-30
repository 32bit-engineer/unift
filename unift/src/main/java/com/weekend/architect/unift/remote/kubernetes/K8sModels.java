package com.weekend.architect.unift.remote.kubernetes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Data transfer objects for Kubernetes cluster management.
 * All data is collected via {@code kubectl} CLI commands executed
 * over the existing SSH exec channel. JSON output is parsed
 * from {@code kubectl get ... -o json} responses.
 */
public final class K8sModels {

    private K8sModels() {}

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class K8sClusterInfo {
        private boolean available;
        private String serverVersion;
        private String platform;
        private String clusterName;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Pod {
        private String name;
        private String namespace;
        private String status;
        private String nodeName;
        private int restarts;
        private String age;
        private String ip;
        private Map<String, String> labels;
        private List<ContainerStatus> containers;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ContainerStatus {
        private String name;
        private String image;
        private boolean ready;
        private int restartCount;
        private String state;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Deployment {
        private String name;
        private String namespace;
        private int replicas;
        private int readyReplicas;
        private int updatedReplicas;
        private int availableReplicas;
        private String age;
        private String strategy;
        private Map<String, String> labels;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class K8sService {
        private String name;
        private String namespace;
        private String type;
        private String clusterIp;
        private String externalIp;
        private String ports;
        private String age;
        private Map<String, String> selector;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Node {
        private String name;
        private String status;
        private String roles;
        private String version;
        private String internalIp;
        private String osImage;
        private String architecture;
        private String cpuCapacity;
        private String memoryCapacity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Namespace {
        private String name;
        private String status;
        private String age;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class K8sOverview {
        private K8sClusterInfo clusterInfo;
        private int totalPods;
        private int runningPods;
        private int pendingPods;
        private int failedPods;
        private int totalDeployments;
        private int totalServices;
        private int totalNodes;
        private int readyNodes;
        private List<Namespace> namespaces;
        private List<Pod> recentPods;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PodPage {
        private List<Pod> pods;
        private int total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DeploymentPage {
        private List<Deployment> deployments;
        private int total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ServicePage {
        private List<K8sService> services;
        private int total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NodePage {
        private List<Node> nodes;
        private int total;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PodActionResult {
        private String podName;
        private String namespace;
        private String action;
        private boolean success;
        private String message;
    }

    // ─── ConfigMaps ───────────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ConfigMap {
        private String name;
        private String namespace;
        private String age;
        private int dataCount;
        private List<String> dataKeys;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ConfigMapPage {
        private List<ConfigMap> configMaps;
        private int total;
    }

    // ─── Ingresses ────────────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IngressPath {
        private String path;
        private String pathType;
        private String serviceName;
        private String servicePort;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IngressHostRule {
        private String host;
        private List<IngressPath> paths;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Ingress {
        private String name;
        private String namespace;
        private String age;
        private String className;
        private boolean tls;
        private List<String> tlsHosts;
        private List<IngressHostRule> rules;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IngressPage {
        private List<Ingress> ingresses;
        private int total;
    }

    // ─── DaemonSets ───────────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DaemonSet {
        private String name;
        private String namespace;
        private String age;
        private int desired;
        private int current;
        private int ready;
        private int upToDate;
        private int available;
        private Map<String, String> labels;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DaemonSetPage {
        private List<DaemonSet> daemonSets;
        private int total;
    }

    // ─── StatefulSets ─────────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatefulSet {
        private String name;
        private String namespace;
        private String age;
        private int replicas;
        private int readyReplicas;
        private String serviceName;
        private Map<String, String> labels;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatefulSetPage {
        private List<StatefulSet> statefulSets;
        private int total;
    }

    // ─── Generic resource YAML (view / edit) ─────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ResourceYaml {
        /** k8s kind string, e.g. "Deployment", "ConfigMap". */
        private String kind;
        private String namespace;
        private String name;
        /** Cleaned YAML ready to display in an editor (managedFields + status stripped). */
        private String yaml;
    }

    // ─── Rollout history / undo ───────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RolloutRevision {
        private int revision;
        /** Value of the {@code kubernetes.io/change-cause} annotation, or {@code "<none>"}. */
        private String changeCause;
        /** Container images in use at this revision. */
        private List<String> images;
        private String createdAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RolloutHistoryPage {
        private String deploymentName;
        private String namespace;
        /** Revision number of the currently active ReplicaSet. */
        private int currentRevision;
        /** Sorted newest-first. */
        private List<RolloutRevision> revisions;
    }
}
