package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ContainerStatus;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Deployment;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.DeploymentPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sClusterInfo;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sOverview;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Namespace;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Node;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.NodePage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Pod;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodActionResult;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ServicePage;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import io.fabric8.kubernetes.api.model.ContainerState;
import io.fabric8.kubernetes.api.model.NamespaceList;
import io.fabric8.kubernetes.api.model.NodeCondition;
import io.fabric8.kubernetes.api.model.NodeList;
import io.fabric8.kubernetes.api.model.PodList;
import io.fabric8.kubernetes.api.model.ServiceList;
import io.fabric8.kubernetes.api.model.apps.DeploymentList;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.VersionInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Kubernetes management service backed by the Fabric8 Kubernetes Java SDK.
 *
 * <h3>Performance design</h3>
 * <p>Each method obtains a {@link KubernetesClient} from {@link K8sClientPool}, which is
 * created once per session (one-time kubeconfig read + optional SSH tunnel) and cached.
 * Subsequent calls reuse the same HTTP/2 connection pool to the k8s API server.
 *
 * <p>{@link #getOverview} fans all five API calls out in parallel via
 * {@link CompletableFuture}, reducing typical response time from 30-60 s (sequential
 * kubectl) to 1-3 s.
 *
 * <h3>Network reachability</h3>
 * <p>If the k8s API server URL in the kubeconfig is reachable directly from the UniFT
 * host the client calls it directly.  When it is only accessible from inside the SSH
 * server (e.g. {@code localhost:6443} or a private cluster IP), {@link K8sClientPool}
 * automatically opens an SSH local port-forward and rewrites the master URL —
 * completely transparent to this service.
 *
 * <h3>Direct kubeconfig path (future)</h3>
 * <p>When a user uploads a kubeconfig directly (no SSH), call
 * {@code k8sClientPool.registerDirect(key, kubeconfigYaml)} and pass that key here.
 * This service needs no changes.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class K8sServiceImpl implements K8sService {

    private final SessionRegistry sessionRegistry;
    private final K8sClientPool k8sClientPool;

    // ─── K8sService impl ─────────────────────────────────────────────────────

    @Override
    public boolean isKubectlAvailable(String sessionId, UUID userId) {
        // With the SDK we probe the API server directly — no kubectl binary needed.
        try {
            VersionInfo v = resolveClient(sessionId, userId).getKubernetesVersion();
            return v != null && v.getMajor() != null;
        } catch (Exception e) {
            log.debug("[k8s] API server not reachable for session {}: {}", sessionId, e.getMessage());
            return false;
        }
    }

    @Override
    public K8sClusterInfo getClusterInfo(String sessionId, UUID userId) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            VersionInfo v = client.getKubernetesVersion();
            String ctx = client.getConfiguration().getCurrentContext() != null
                    ? client.getConfiguration().getCurrentContext().getName()
                    : "default";
            return K8sClusterInfo.builder()
                    .available(true)
                    .serverVersion(v.getMajor() + "." + v.getMinor())
                    .platform(v.getPlatform() != null ? v.getPlatform() : "")
                    .clusterName(ctx != null ? ctx : "default")
                    .build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to get cluster info for session {}: {}", sessionId, e.getMessage());
            return K8sClusterInfo.builder().available(false).build();
        }
    }

    @Override
    public K8sOverview getOverview(String sessionId, UUID userId, String namespace) {
        KubernetesClient client = resolveClient(sessionId, userId);
        boolean allNs = namespace == null || namespace.isBlank() || "all".equalsIgnoreCase(namespace);

        K8sClusterInfo clusterInfo = K8sClusterInfo.builder().available(false).build();
        try {
            // ── Fan out all API calls in parallel ──────────────────────────────
            CompletableFuture<PodList> podsFuture = CompletableFuture.supplyAsync(() -> allNs
                    ? client.pods().inAnyNamespace().list()
                    : client.pods().inNamespace(namespace).list());

            CompletableFuture<DeploymentList> depsFuture = CompletableFuture.supplyAsync(() -> allNs
                    ? client.apps().deployments().inAnyNamespace().list()
                    : client.apps().deployments().inNamespace(namespace).list());

            CompletableFuture<ServiceList> svcsFuture = CompletableFuture.supplyAsync(() -> allNs
                    ? client.services().inAnyNamespace().list()
                    : client.services().inNamespace(namespace).list());

            CompletableFuture<NodeList> nodesFuture =
                    CompletableFuture.supplyAsync(() -> client.nodes().list());

            CompletableFuture<NamespaceList> nsFuture =
                    CompletableFuture.supplyAsync(() -> client.namespaces().list());

            CompletableFuture<VersionInfo> versionFuture = CompletableFuture.supplyAsync(client::getKubernetesVersion);

            // Wait for all six futures concurrently
            CompletableFuture.allOf(podsFuture, depsFuture, svcsFuture, nodesFuture, nsFuture, versionFuture)
                    .join();

            // ── Cluster info ───────────────────────────────────────────────────
            try {
                VersionInfo v = versionFuture.join();
                String ctxName = client.getConfiguration().getCurrentContext() != null
                        ? client.getConfiguration().getCurrentContext().getName()
                        : "default";
                clusterInfo = K8sClusterInfo.builder()
                        .available(true)
                        .serverVersion(v.getMajor() + "." + v.getMinor())
                        .platform(v.getPlatform() != null ? v.getPlatform() : "")
                        .clusterName(ctxName != null ? ctxName : "default")
                        .build();
            } catch (Exception e) {
                log.warn("[k8s] Version fetch failed for session {}: {}", sessionId, e.getMessage());
            }

            // ── Pods ───────────────────────────────────────────────────────────
            PodList podList = podsFuture.join();
            int totalPods = 0, runningPods = 0, pendingPods = 0, failedPods = 0;
            List<Pod> recentPods = new ArrayList<>();
            if (podList.getItems() != null) {
                for (var p : podList.getItems()) {
                    totalPods++;
                    String phase = p.getStatus() != null && p.getStatus().getPhase() != null
                            ? p.getStatus().getPhase().toLowerCase()
                            : "";
                    switch (phase) {
                        case "running" -> runningPods++;
                        case "pending" -> pendingPods++;
                        case "failed" -> failedPods++;
                    }
                    if (recentPods.size() < 10) recentPods.add(toPod(p));
                }
            }

            // ── Deployments ────────────────────────────────────────────────────
            int totalDeployments = depsFuture.join().getItems() != null
                    ? depsFuture.join().getItems().size()
                    : 0;

            // ── Services ───────────────────────────────────────────────────────
            int totalServices = svcsFuture.join().getItems() != null
                    ? svcsFuture.join().getItems().size()
                    : 0;

            // ── Nodes ──────────────────────────────────────────────────────────
            NodeList nodeList = nodesFuture.join();
            int totalNodes = 0, readyNodes = 0;
            if (nodeList.getItems() != null) {
                totalNodes = nodeList.getItems().size();
                for (var n : nodeList.getItems()) if (isNodeReady(n)) readyNodes++;
            }

            // ── Namespaces ─────────────────────────────────────────────────────
            List<Namespace> namespaces = toNamespaces(nsFuture.join());

            return K8sOverview.builder()
                    .clusterInfo(clusterInfo)
                    .totalPods(totalPods)
                    .runningPods(runningPods)
                    .pendingPods(pendingPods)
                    .failedPods(failedPods)
                    .totalDeployments(totalDeployments)
                    .totalServices(totalServices)
                    .totalNodes(totalNodes)
                    .readyNodes(readyNodes)
                    .namespaces(namespaces)
                    .recentPods(recentPods)
                    .build();

        } catch (Exception e) {
            log.warn("[k8s] Failed to get overview for session {}: {}", sessionId, e.getMessage());
            return K8sOverview.builder()
                    .clusterInfo(clusterInfo)
                    .namespaces(List.of())
                    .recentPods(List.of())
                    .build();
        }
    }

    @Override
    public List<Namespace> listNamespaces(String sessionId, UUID userId) {
        try {
            return toNamespaces(resolveClient(sessionId, userId).namespaces().list());
        } catch (Exception e) {
            log.warn("[k8s] Failed to list namespaces for session {}: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    @Override
    public PodPage listPods(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = namespace == null || namespace.isBlank() || "all".equalsIgnoreCase(namespace);
            PodList list = allNs
                    ? client.pods().inAnyNamespace().list()
                    : client.pods().inNamespace(namespace).list();
            List<Pod> pods = list.getItems() != null
                    ? list.getItems().stream().map(this::toPod).toList()
                    : List.of();
            return PodPage.builder().pods(pods).total(pods.size()).build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list pods for session {}: {}", sessionId, e.getMessage());
            return PodPage.builder().pods(List.of()).total(0).build();
        }
    }

    @Override
    public String getPodLogs(String sessionId, UUID userId, String namespace, String podName, int tailLines) {
        int safeTail = Math.max(1, Math.min(tailLines, 5000));
        String ns = resolveNamespace(namespace);
        try {
            return resolveClient(sessionId, userId)
                    .pods()
                    .inNamespace(ns)
                    .withName(podName)
                    .tailingLines(safeTail)
                    .getLog();
        } catch (Exception e) {
            log.warn("[k8s] Failed to get logs for {}/{} session {}: {}", ns, podName, sessionId, e.getMessage());
            return "Failed to fetch logs: " + e.getMessage();
        }
    }

    @Override
    public PodActionResult deletePod(String sessionId, UUID userId, String namespace, String podName) {
        String ns = resolveNamespace(namespace);
        try {
            resolveClient(sessionId, userId)
                    .pods()
                    .inNamespace(ns)
                    .withName(podName)
                    .delete();
            return PodActionResult.builder()
                    .podName(podName)
                    .namespace(ns)
                    .action("delete")
                    .success(true)
                    .message("pod \"" + podName + "\" deleted")
                    .build();
        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(podName)
                    .namespace(ns)
                    .action("delete")
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    @Override
    public DeploymentPage listDeployments(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = namespace == null || namespace.isBlank() || "all".equalsIgnoreCase(namespace);
            DeploymentList list = allNs
                    ? client.apps().deployments().inAnyNamespace().list()
                    : client.apps().deployments().inNamespace(namespace).list();
            List<Deployment> deployments = list.getItems() != null
                    ? list.getItems().stream().map(this::toDeployment).toList()
                    : List.of();
            return DeploymentPage.builder()
                    .deployments(deployments)
                    .total(deployments.size())
                    .build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list deployments for session {}: {}", sessionId, e.getMessage());
            return DeploymentPage.builder().deployments(List.of()).total(0).build();
        }
    }

    @Override
    public PodActionResult scaleDeployment(
            String sessionId, UUID userId, String namespace, String deploymentName, int replicas) {
        String ns = resolveNamespace(namespace);
        int safeReplicas = Math.max(0, Math.min(replicas, 100));
        try {
            resolveClient(sessionId, userId)
                    .apps()
                    .deployments()
                    .inNamespace(ns)
                    .withName(deploymentName)
                    .scale(safeReplicas);
            return PodActionResult.builder()
                    .podName(deploymentName)
                    .namespace(ns)
                    .action("scale")
                    .success(true)
                    .message("deployment.apps \"" + deploymentName + "\" scaled")
                    .build();
        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(deploymentName)
                    .namespace(ns)
                    .action("scale")
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    @Override
    public PodActionResult restartDeployment(String sessionId, UUID userId, String namespace, String deploymentName) {
        String ns = resolveNamespace(namespace);
        try {
            resolveClient(sessionId, userId)
                    .apps()
                    .deployments()
                    .inNamespace(ns)
                    .withName(deploymentName)
                    .rolling()
                    .restart();
            return PodActionResult.builder()
                    .podName(deploymentName)
                    .namespace(ns)
                    .action("restart")
                    .success(true)
                    .message("deployment.apps \"" + deploymentName + "\" restarted")
                    .build();
        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(deploymentName)
                    .namespace(ns)
                    .action("restart")
                    .success(false)
                    .message(e.getMessage())
                    .build();
        }
    }

    @Override
    public ServicePage listServices(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = namespace == null || namespace.isBlank() || "all".equalsIgnoreCase(namespace);
            ServiceList list = allNs
                    ? client.services().inAnyNamespace().list()
                    : client.services().inNamespace(namespace).list();
            List<K8sModels.K8sService> services = list.getItems() != null
                    ? list.getItems().stream().map(this::toService).toList()
                    : List.of();
            return ServicePage.builder()
                    .services(services)
                    .total(services.size())
                    .build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list services for session {}: {}", sessionId, e.getMessage());
            return ServicePage.builder().services(List.of()).total(0).build();
        }
    }

    @Override
    public NodePage listNodes(String sessionId, UUID userId) {
        try {
            NodeList list = resolveClient(sessionId, userId).nodes().list();
            List<Node> nodes = list.getItems() != null
                    ? list.getItems().stream().map(this::toNode).toList()
                    : List.of();
            return NodePage.builder().nodes(nodes).total(nodes.size()).build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list nodes for session {}: {}", sessionId, e.getMessage());
            return NodePage.builder().nodes(List.of()).total(0).build();
        }
    }

    // ─── Session resolution ──────────────────────────────────────────────────

    private KubernetesClient resolveClient(String sessionId, UUID userId) {
        RemoteConnection conn = sessionRegistry.require(sessionId);
        if (!conn.getSession().getOwnerId().equals(userId)) {
            throw new SessionAccessDeniedException("Not authorized for session " + sessionId);
        }
        if (!(conn instanceof RemoteShell shell)) {
            throw new RemoteConnectionException("Session does not support shell execution");
        }
        return k8sClientPool.resolveForSession(sessionId, shell);
    }

    // ─── SDK → domain model mappers ──────────────────────────────────────────

    private Pod toPod(io.fabric8.kubernetes.api.model.Pod p) {
        var meta = p.getMetadata();
        var status = p.getStatus();
        var spec = p.getSpec();

        int restarts = 0;
        List<ContainerStatus> containerStatuses = new ArrayList<>();
        if (status != null && status.getContainerStatuses() != null) {
            for (var cs : status.getContainerStatuses()) {
                int rc = cs.getRestartCount() != null ? cs.getRestartCount() : 0;
                restarts += rc;
                containerStatuses.add(ContainerStatus.builder()
                        .name(cs.getName())
                        .image(cs.getImage())
                        .ready(Boolean.TRUE.equals(cs.getReady()))
                        .restartCount(rc)
                        .state(deriveContainerState(cs.getState()))
                        .build());
            }
        }
        return Pod.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .status(status != null && status.getPhase() != null ? status.getPhase() : "Unknown")
                .nodeName(spec != null && spec.getNodeName() != null ? spec.getNodeName() : "")
                .restarts(restarts)
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .ip(status != null && status.getPodIP() != null ? status.getPodIP() : "")
                .labels(meta != null && meta.getLabels() != null ? meta.getLabels() : Map.of())
                .containers(containerStatuses)
                .build();
    }

    private Deployment toDeployment(io.fabric8.kubernetes.api.model.apps.Deployment d) {
        var meta = d.getMetadata();
        var spec = d.getSpec();
        var status = d.getStatus();
        return Deployment.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .replicas(spec != null && spec.getReplicas() != null ? spec.getReplicas() : 0)
                .readyReplicas(status != null && status.getReadyReplicas() != null ? status.getReadyReplicas() : 0)
                .updatedReplicas(
                        status != null && status.getUpdatedReplicas() != null ? status.getUpdatedReplicas() : 0)
                .availableReplicas(
                        status != null && status.getAvailableReplicas() != null ? status.getAvailableReplicas() : 0)
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .strategy(
                        spec != null
                                        && spec.getStrategy() != null
                                        && spec.getStrategy().getType() != null
                                ? spec.getStrategy().getType()
                                : "")
                .labels(meta != null && meta.getLabels() != null ? meta.getLabels() : Map.of())
                .build();
    }

    private K8sModels.K8sService toService(io.fabric8.kubernetes.api.model.Service s) {
        var meta = s.getMetadata();
        var spec = s.getSpec();
        var status = s.getStatus();

        StringBuilder portsStr = new StringBuilder();
        if (spec != null && spec.getPorts() != null) {
            for (int i = 0; i < spec.getPorts().size(); i++) {
                if (i > 0) portsStr.append(", ");
                var p = spec.getPorts().get(i);
                portsStr.append(p.getPort());
                if (p.getTargetPort() != null) portsStr.append(":").append(p.getTargetPort());
                portsStr.append("/").append(p.getProtocol() != null ? p.getProtocol() : "TCP");
            }
        }

        String externalIp = "<none>";
        if (status != null
                && status.getLoadBalancer() != null
                && status.getLoadBalancer().getIngress() != null
                && !status.getLoadBalancer().getIngress().isEmpty()) {
            var ingress = status.getLoadBalancer().getIngress().get(0);
            externalIp = ingress.getIp() != null ? ingress.getIp() : ingress.getHostname();
        } else if (spec != null
                && spec.getExternalIPs() != null
                && !spec.getExternalIPs().isEmpty()) {
            externalIp = spec.getExternalIPs().get(0);
        }

        return K8sModels.K8sService.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .type(spec != null && spec.getType() != null ? spec.getType() : "")
                .clusterIp(spec != null && spec.getClusterIP() != null ? spec.getClusterIP() : "")
                .externalIp(externalIp)
                .ports(portsStr.toString())
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .selector(spec != null && spec.getSelector() != null ? spec.getSelector() : Map.of())
                .build();
    }

    private Node toNode(io.fabric8.kubernetes.api.model.Node n) {
        var meta = n.getMetadata();
        var status = n.getStatus();
        var nodeInfo = status != null ? status.getNodeInfo() : null;
        var capacity = status != null ? status.getCapacity() : null;

        String nodeStatus = "Unknown";
        if (status != null && status.getConditions() != null) {
            for (NodeCondition cond : status.getConditions()) {
                if ("Ready".equals(cond.getType())) {
                    nodeStatus = "True".equals(cond.getStatus()) ? "Ready" : "NotReady";
                    break;
                }
            }
        }

        Map<String, String> labels = meta != null && meta.getLabels() != null ? meta.getLabels() : Map.of();
        StringBuilder roles = new StringBuilder();
        for (var e : labels.entrySet()) {
            if (e.getKey().startsWith("node-role.kubernetes.io/")) {
                if (!roles.isEmpty()) roles.append(",");
                roles.append(e.getKey().substring("node-role.kubernetes.io/".length()));
            }
        }

        String internalIp = "";
        if (status != null && status.getAddresses() != null) {
            for (var addr : status.getAddresses()) {
                if ("InternalIP".equals(addr.getType())) {
                    internalIp = addr.getAddress();
                    break;
                }
            }
        }

        return Node.builder()
                .name(meta != null ? meta.getName() : "")
                .status(nodeStatus)
                .roles(roles.isEmpty() ? "<none>" : roles.toString())
                .version(nodeInfo != null ? nodeInfo.getKubeletVersion() : "")
                .internalIp(internalIp)
                .osImage(nodeInfo != null ? nodeInfo.getOsImage() : "")
                .architecture(nodeInfo != null ? nodeInfo.getArchitecture() : "")
                .cpuCapacity(
                        capacity != null && capacity.get("cpu") != null
                                ? capacity.get("cpu").getAmount()
                                : "")
                .memoryCapacity(
                        capacity != null && capacity.get("memory") != null
                                ? capacity.get("memory").getAmount()
                                : "")
                .build();
    }

    private List<Namespace> toNamespaces(NamespaceList list) {
        if (list == null || list.getItems() == null) return List.of();
        return list.getItems().stream()
                .map(ns -> Namespace.builder()
                        .name(ns.getMetadata() != null ? ns.getMetadata().getName() : "")
                        .status(
                                ns.getStatus() != null && ns.getStatus().getPhase() != null
                                        ? ns.getStatus().getPhase()
                                        : "Active")
                        .age(ns.getMetadata() != null ? ns.getMetadata().getCreationTimestamp() : "")
                        .build())
                .toList();
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    private boolean isNodeReady(io.fabric8.kubernetes.api.model.Node node) {
        if (node.getStatus() == null || node.getStatus().getConditions() == null) return false;
        for (NodeCondition cond : node.getStatus().getConditions()) {
            if ("Ready".equals(cond.getType())) return "True".equals(cond.getStatus());
        }
        return false;
    }

    private String deriveContainerState(ContainerState state) {
        if (state == null) return "unknown";
        if (state.getRunning() != null) return "running";
        if (state.getWaiting() != null)
            return "waiting:"
                    + (state.getWaiting().getReason() != null
                            ? state.getWaiting().getReason()
                            : "");
        if (state.getTerminated() != null)
            return "terminated:"
                    + (state.getTerminated().getReason() != null
                            ? state.getTerminated().getReason()
                            : "");
        return "unknown";
    }

    private String resolveNamespace(String namespace) {
        return (namespace == null || namespace.isBlank()) ? "default" : namespace;
    }
}
