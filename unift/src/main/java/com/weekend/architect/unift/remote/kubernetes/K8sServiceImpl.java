package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.core.RemoteConnection;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ConfigMap;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ConfigMapPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ContainerStatus;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.DaemonSet;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.DaemonSetPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Deployment;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.DeploymentPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Ingress;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.IngressHostRule;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.IngressPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.IngressPath;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sClusterInfo;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sOverview;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Namespace;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Node;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.NodePage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Pod;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodActionResult;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ResourceYaml;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.RolloutHistoryPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.RolloutRevision;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ServicePage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.StatefulSet;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.StatefulSetPage;
import com.weekend.architect.unift.remote.registry.SessionRegistry;
import io.fabric8.kubernetes.api.model.ContainerState;
import io.fabric8.kubernetes.api.model.HasMetadata;
import io.fabric8.kubernetes.api.model.KubernetesResource;
import io.fabric8.kubernetes.api.model.NamespaceList;
import io.fabric8.kubernetes.api.model.NodeCondition;
import io.fabric8.kubernetes.api.model.NodeList;
import io.fabric8.kubernetes.api.model.OwnerReference;
import io.fabric8.kubernetes.api.model.PodList;
import io.fabric8.kubernetes.api.model.ServiceList;
import io.fabric8.kubernetes.api.model.apps.DaemonSetList;
import io.fabric8.kubernetes.api.model.apps.DeploymentList;
import io.fabric8.kubernetes.api.model.apps.ReplicaSet;
import io.fabric8.kubernetes.api.model.apps.ReplicaSetList;
import io.fabric8.kubernetes.api.model.apps.StatefulSetList;
import io.fabric8.kubernetes.api.model.networking.v1.HTTPIngressPath;
import io.fabric8.kubernetes.api.model.networking.v1.IngressList;
import io.fabric8.kubernetes.api.model.networking.v1.IngressRule;
import io.fabric8.kubernetes.api.model.networking.v1.IngressTLS;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.VersionInfo;
import io.fabric8.kubernetes.client.utils.Serialization;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import io.fabric8.kubernetes.client.dsl.LogWatch;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

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
    public void streamPodLogs(String sessionId, UUID userId, String namespace, String podName,
            int tailLines, SseEmitter emitter) {
        int safeTail = Math.max(1, Math.min(tailLines, 5_000));
        String ns = resolveNamespace(namespace);
        CompletableFuture.runAsync(() -> {
            try (LogWatch watch = resolveClient(sessionId, userId)
                    .pods()
                    .inNamespace(ns)
                    .withName(podName)
                    .tailingLines(safeTail)
                    .watchLog();
                 BufferedReader reader = new BufferedReader(
                         new InputStreamReader(watch.getOutput(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    emitter.send(SseEmitter.event().data(line));
                }
                emitter.complete();
            } catch (IOException e) {
                log.warn("[k8s] Log stream I/O error for {}/{}: {}", ns, podName, e.getMessage());
                try { emitter.completeWithError(e); } catch (Exception ignored) {}
            } catch (Exception e) {
                log.warn("[k8s] Log stream error for {}/{}: {}", ns, podName, e.getMessage());
                try { emitter.completeWithError(e); } catch (Exception ignored) {}
            }
        });
        emitter.onTimeout(emitter::complete);
        emitter.onError(ex -> emitter.complete());
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


    @Override
    public ConfigMapPage listConfigMaps(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = isAllNamespaces(namespace);
            io.fabric8.kubernetes.api.model.ConfigMapList list = allNs
                    ? client.configMaps().inAnyNamespace().list()
                    : client.configMaps().inNamespace(namespace).list();
            List<ConfigMap> configMaps = list.getItems() != null
                    ? list.getItems().stream().map(this::toConfigMap).toList() : List.of();
            return ConfigMapPage.builder().configMaps(configMaps).total(configMaps.size()).build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list configmaps for session {}: {}", sessionId, e.getMessage());
            return ConfigMapPage.builder().configMaps(List.of()).total(0).build();
        }
    }

    @Override
    public IngressPage listIngresses(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = isAllNamespaces(namespace);
            IngressList list = allNs
                    ? client.network().v1().ingresses().inAnyNamespace().list()
                    : client.network().v1().ingresses().inNamespace(namespace).list();
            List<Ingress> ingresses = list.getItems() != null
                    ? list.getItems().stream().map(this::toIngress).toList() : List.of();
            return IngressPage.builder().ingresses(ingresses).total(ingresses.size()).build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list ingresses for session {}: {}", sessionId, e.getMessage());
            return IngressPage.builder().ingresses(List.of()).total(0).build();
        }
    }

    @Override
    public DaemonSetPage listDaemonSets(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = isAllNamespaces(namespace);
            DaemonSetList list = allNs
                    ? client.apps().daemonSets().inAnyNamespace().list()
                    : client.apps().daemonSets().inNamespace(namespace).list();
            List<DaemonSet> daemonSets = list.getItems() != null
                    ? list.getItems().stream().map(this::toDaemonSet).toList() : List.of();
            return DaemonSetPage.builder().daemonSets(daemonSets).total(daemonSets.size()).build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list daemonsets for session {}: {}", sessionId, e.getMessage());
            return DaemonSetPage.builder().daemonSets(List.of()).total(0).build();
        }
    }

    @Override
    public PodActionResult restartDaemonSet(String sessionId, UUID userId, String namespace, String name) {
        String ns = resolveNamespace(namespace);
        try {
            // Fabric8 7.x DaemonSetResource does not implement RollableScalableResource,
            // so .rolling().restart() is unavailable.  Patch the pod template annotation
            // instead — this is exactly what `kubectl rollout restart daemonset/name` does.
            resolveClient(sessionId, userId).apps().daemonSets().inNamespace(ns).withName(name)
                    .edit(ds -> {
                        var meta = ds.getSpec().getTemplate().getMetadata();
                        if (meta.getAnnotations() == null) meta.setAnnotations(new HashMap<>());
                        meta.getAnnotations().put("kubectl.kubernetes.io/restartedAt",
                                java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).toString());
                        return ds;
                    });
            return PodActionResult.builder()
                    .podName(name).namespace(ns).action("restart")
                    .success(true).message("daemonset.apps \"" + name + "\" restarted")
                    .build();
        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(name).namespace(ns).action("restart")
                    .success(false).message(e.getMessage())
                    .build();
        }
    }


    @Override
    public StatefulSetPage listStatefulSets(String sessionId, UUID userId, String namespace) {
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            boolean allNs = isAllNamespaces(namespace);
            StatefulSetList list = allNs
                    ? client.apps().statefulSets().inAnyNamespace().list()
                    : client.apps().statefulSets().inNamespace(namespace).list();
            List<StatefulSet> statefulSets = list.getItems() != null
                    ? list.getItems().stream().map(this::toStatefulSet).toList() : List.of();
            return StatefulSetPage.builder().statefulSets(statefulSets).total(statefulSets.size()).build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to list statefulsets for session {}: {}", sessionId, e.getMessage());
            return StatefulSetPage.builder().statefulSets(List.of()).total(0).build();
        }
    }

    @Override
    public PodActionResult restartStatefulSet(String sessionId, UUID userId, String namespace, String name) {
        String ns = resolveNamespace(namespace);
        try {
            resolveClient(sessionId, userId).apps().statefulSets().inNamespace(ns).withName(name)
                    .rolling().restart();
            return PodActionResult.builder()
                    .podName(name).namespace(ns).action("restart")
                    .success(true).message("statefulset.apps \"" + name + "\" restarted")
                    .build();
        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(name).namespace(ns).action("restart")
                    .success(false).message(e.getMessage())
                    .build();
        }
    }

    @Override
    public PodActionResult scaleStatefulSet(String sessionId, UUID userId, String namespace, String name, int replicas) {
        String ns = resolveNamespace(namespace);
        int safeReplicas = Math.max(0, Math.min(replicas, 100));
        try {
            resolveClient(sessionId, userId).apps().statefulSets().inNamespace(ns).withName(name)
                    .scale(safeReplicas);
            return PodActionResult.builder()
                    .podName(name).namespace(ns).action("scale")
                    .success(true).message("statefulset.apps \"" + name + "\" scaled")
                    .build();
        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(name).namespace(ns).action("scale")
                    .success(false).message(e.getMessage())
                    .build();
        }
    }

    @Override
    public ResourceYaml getResourceYaml(String sessionId, UUID userId,
            String kind, String namespace, String name) {
        String ns = resolveNamespace(namespace);
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            HasMetadata resource = fetchResource(client, kind, ns, name);
            if (resource == null) {
                return ResourceYaml.builder()
                        .kind(kind).namespace(ns).name(name)
                        .yaml("# Resource not found: " + kind + "/" + name)
                        .build();
            }
            // Strip noise fields before presenting to editor
            stripEditorNoise(resource);
            String yaml = cleanYamlForEditor(Serialization.asYaml(resource));
            return ResourceYaml.builder()
                    .kind(resource.getKind() != null ? resource.getKind() : kind)
                    .namespace(ns)
                    .name(name)
                    .yaml(yaml)
                    .build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to get YAML for {}/{}/{}: {}", kind, ns, name, e.getMessage());
            return ResourceYaml.builder()
                    .kind(kind).namespace(ns).name(name)
                    .yaml("# Error fetching resource: " + e.getMessage())
                    .build();
        }
    }

    @Override
    public PodActionResult applyResourceYaml(String sessionId, UUID userId, String yamlContent) {
        String resourceId = "unknown";
        try {
            KubernetesClient client = resolveClient(sessionId, userId);
            KubernetesResource parsed = Serialization.unmarshal(
                    new ByteArrayInputStream(yamlContent.getBytes(StandardCharsets.UTF_8)));
            if (!(parsed instanceof HasMetadata hm)) {
                return PodActionResult.builder()
                        .action("apply").success(false)
                        .message("YAML does not represent a valid Kubernetes resource")
                        .build();
            }
            resourceId = hm.getKind() + "/" + hm.getMetadata().getName();
            // Server-side apply with force-conflict so field manager conflicts don't block saves
            client.resource(hm).forceConflicts().serverSideApply();
            return PodActionResult.builder()
                    .podName(hm.getMetadata().getName())
                    .namespace(hm.getMetadata().getNamespace())
                    .action("apply")
                    .success(true)
                    .message(resourceId + " configured")
                    .build();
        } catch (Exception e) {
            log.warn("[k8s] Failed to apply YAML for {}: {}", resourceId, e.getMessage());
            return PodActionResult.builder()
                    .action("apply").success(false).message(e.getMessage())
                    .build();
        }
    }



    @Override
    public RolloutHistoryPage getRolloutHistory(String sessionId, UUID userId,
            String namespace, String deploymentName) {
        String ns = resolveNamespace(namespace);
        try {
            KubernetesClient client = resolveClient(sessionId, userId);

            // Get the deployment to find its UID and current revision
            io.fabric8.kubernetes.api.model.apps.Deployment dep =
                    client.apps().deployments().inNamespace(ns).withName(deploymentName).get();
            if (dep == null) {
                return RolloutHistoryPage.builder()
                        .deploymentName(deploymentName).namespace(ns)
                        .currentRevision(0).revisions(List.of()).build();
            }

            String depUid = dep.getMetadata().getUid();
            int currentRevision = parseRevision(
                    dep.getMetadata().getAnnotations(), "deployment.kubernetes.io/revision");

            // Collect all ReplicaSets owned by this Deployment
            ReplicaSetList rsList = client.apps().replicaSets().inNamespace(ns).list();
            List<RolloutRevision> revisions = new ArrayList<>();

            if (rsList.getItems() != null) {
                for (ReplicaSet rs : rsList.getItems()) {
                    if (!isOwnedBy(rs, depUid)) continue;
                    int rev = parseRevision(
                            rs.getMetadata().getAnnotations(), "deployment.kubernetes.io/revision");
                    if (rev <= 0) continue;

                    String changeCause = annotationOrNone(
                            rs.getMetadata().getAnnotations(), "kubernetes.io/change-cause");

                    // Collect container images for this revision
                    List<String> images = List.of();
                    if (rs.getSpec() != null && rs.getSpec().getTemplate() != null
                            && rs.getSpec().getTemplate().getSpec() != null
                            && rs.getSpec().getTemplate().getSpec().getContainers() != null) {
                        images = rs.getSpec().getTemplate().getSpec().getContainers().stream()
                                .map(c -> c.getName() + "=" + c.getImage())
                                .toList();
                    }

                    revisions.add(RolloutRevision.builder()
                            .revision(rev)
                            .changeCause(changeCause)
                            .images(images)
                            .createdAt(rs.getMetadata().getCreationTimestamp())
                            .build());
                }
            }

            // Sort newest revision first
            revisions.sort(Comparator.comparingInt(RolloutRevision::getRevision).reversed());

            return RolloutHistoryPage.builder()
                    .deploymentName(deploymentName)
                    .namespace(ns)
                    .currentRevision(currentRevision)
                    .revisions(revisions)
                    .build();

        } catch (Exception e) {
            log.warn("[k8s] Failed to get rollout history for {}/{}: {}", ns, deploymentName, e.getMessage());
            return RolloutHistoryPage.builder()
                    .deploymentName(deploymentName).namespace(ns)
                    .currentRevision(0).revisions(List.of()).build();
        }
    }

    @Override
    public PodActionResult undoRollout(String sessionId, UUID userId,
            String namespace, String deploymentName, int revision) {
        String ns = resolveNamespace(namespace);
        try {
            KubernetesClient client = resolveClient(sessionId, userId);

            io.fabric8.kubernetes.api.model.apps.Deployment dep =
                    client.apps().deployments().inNamespace(ns).withName(deploymentName).get();
            if (dep == null) {
                return PodActionResult.builder()
                        .podName(deploymentName).namespace(ns).action("rollback")
                        .success(false).message("Deployment not found").build();
            }

            String depUid = dep.getMetadata().getUid();
            int currentRevision = parseRevision(
                    dep.getMetadata().getAnnotations(), "deployment.kubernetes.io/revision");

            // Find all RSes owned by this deployment, sorted by revision
            ReplicaSetList rsList = client.apps().replicaSets().inNamespace(ns).list();
            List<ReplicaSet> owned = new ArrayList<>();
            if (rsList.getItems() != null) {
                for (ReplicaSet rs : rsList.getItems()) {
                    if (isOwnedBy(rs, depUid) && parseRevision(
                            rs.getMetadata().getAnnotations(),
                            "deployment.kubernetes.io/revision") > 0) {
                        owned.add(rs);
                    }
                }
            }
            owned.sort(Comparator.comparingInt(rs ->
                    parseRevision(rs.getMetadata().getAnnotations(), "deployment.kubernetes.io/revision")));

            // Resolve target revision: 0 means "previous"
            int targetRevision = (revision <= 0) ? currentRevision - 1 : revision;
            ReplicaSet targetRs = owned.stream()
                    .filter(rs -> parseRevision(
                            rs.getMetadata().getAnnotations(),
                            "deployment.kubernetes.io/revision") == targetRevision)
                    .findFirst()
                    .orElse(null);

            if (targetRs == null) {
                return PodActionResult.builder()
                        .podName(deploymentName).namespace(ns).action("rollback")
                        .success(false)
                        .message("No ReplicaSet found for revision " + targetRevision)
                        .build();
            }

            // Patch the deployment's pod template to match the target RS.
            // Use edit() so Fabric8 does a read-modify-write under the hood.
            final ReplicaSet finalTargetRs = targetRs;
            client.apps().deployments().inNamespace(ns).withName(deploymentName)
                    .edit(d -> {
                        var template = finalTargetRs.getSpec().getTemplate();
                        // Remove pod-template-hash — it's set by the controller, not by us
                        if (template.getMetadata() != null && template.getMetadata().getLabels() != null) {
                            template.getMetadata().getLabels().remove("pod-template-hash");
                        }
                        d.getSpec().setTemplate(template);
                        return d;
                    });

            return PodActionResult.builder()
                    .podName(deploymentName).namespace(ns).action("rollback")
                    .success(true)
                    .message("deployment.apps \"" + deploymentName + "\" rolled back to revision " + targetRevision)
                    .build();

        } catch (Exception e) {
            return PodActionResult.builder()
                    .podName(deploymentName).namespace(ns).action("rollback")
                    .success(false).message(e.getMessage())
                    .build();
        }
    }



    private ConfigMap toConfigMap(io.fabric8.kubernetes.api.model.ConfigMap cm) {
        var meta = cm.getMetadata();
        var data = cm.getData();
        List<String> keys = data != null ? new ArrayList<>(data.keySet()) : List.of();
        return ConfigMap.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .dataCount(keys.size())
                .dataKeys(keys)
                .build();
    }

    private Ingress toIngress(io.fabric8.kubernetes.api.model.networking.v1.Ingress ing) {
        var meta = ing.getMetadata();
        var spec = ing.getSpec();

        List<IngressHostRule> rules = new ArrayList<>();
        if (spec != null && spec.getRules() != null) {
            for (IngressRule rule : spec.getRules()) {
                List<IngressPath> paths = new ArrayList<>();
                if (rule.getHttp() != null && rule.getHttp().getPaths() != null) {
                    for (HTTPIngressPath p : rule.getHttp().getPaths()) {
                        String svcName = "";
                        String svcPort = "";
                        if (p.getBackend() != null && p.getBackend().getService() != null) {
                            svcName = p.getBackend().getService().getName();
                            if (p.getBackend().getService().getPort() != null) {
                                var port = p.getBackend().getService().getPort();
                                svcPort = port.getNumber() != null
                                        ? String.valueOf(port.getNumber()) : port.getName();
                            }
                        }
                        paths.add(IngressPath.builder()
                                .path(p.getPath() != null ? p.getPath() : "/")
                                .pathType(p.getPathType() != null ? p.getPathType() : "")
                                .serviceName(svcName)
                                .servicePort(svcPort)
                                .build());
                    }
                }
                rules.add(IngressHostRule.builder()
                        .host(rule.getHost() != null ? rule.getHost() : "*")
                        .paths(paths)
                        .build());
            }
        }

        List<String> tlsHosts = new ArrayList<>();
        boolean hasTls = false;
        if (spec != null && spec.getTls() != null) {
            hasTls = !spec.getTls().isEmpty();
            for (IngressTLS tls : spec.getTls()) {
                if (tls.getHosts() != null) tlsHosts.addAll(tls.getHosts());
            }
        }

        String className = (spec != null && spec.getIngressClassName() != null)
                ? spec.getIngressClassName() : "";

        return Ingress.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .className(className)
                .tls(hasTls)
                .tlsHosts(tlsHosts)
                .rules(rules)
                .build();
    }

    private DaemonSet toDaemonSet(io.fabric8.kubernetes.api.model.apps.DaemonSet ds) {
        var meta   = ds.getMetadata();
        var status = ds.getStatus();
        return DaemonSet.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .desired(status != null && status.getDesiredNumberScheduled() != null
                        ? status.getDesiredNumberScheduled() : 0)
                .current(status != null && status.getCurrentNumberScheduled() != null
                        ? status.getCurrentNumberScheduled() : 0)
                .ready(status != null && status.getNumberReady() != null
                        ? status.getNumberReady() : 0)
                .upToDate(status != null && status.getUpdatedNumberScheduled() != null
                        ? status.getUpdatedNumberScheduled() : 0)
                .available(status != null && status.getNumberAvailable() != null
                        ? status.getNumberAvailable() : 0)
                .labels(meta != null && meta.getLabels() != null ? meta.getLabels() : Map.of())
                .build();
    }

    private StatefulSet toStatefulSet(io.fabric8.kubernetes.api.model.apps.StatefulSet ss) {
        var meta   = ss.getMetadata();
        var spec   = ss.getSpec();
        var status = ss.getStatus();
        return StatefulSet.builder()
                .name(meta != null ? meta.getName() : "")
                .namespace(meta != null ? meta.getNamespace() : "")
                .age(meta != null ? meta.getCreationTimestamp() : "")
                .replicas(spec != null && spec.getReplicas() != null ? spec.getReplicas() : 0)
                .readyReplicas(status != null && status.getReadyReplicas() != null
                        ? status.getReadyReplicas() : 0)
                .serviceName(spec != null && spec.getServiceName() != null ? spec.getServiceName() : "")
                .labels(meta != null && meta.getLabels() != null ? meta.getLabels() : Map.of())
                .build();
    }



    /**
     * Fetches a named resource by kind string. Returns {@code null} for unknown kinds.
     */
    private HasMetadata fetchResource(KubernetesClient client, String kind, String namespace, String name) {
        return switch (kind.toLowerCase()) {
            case "deployment"                     -> client.apps().deployments().inNamespace(namespace).withName(name).get();
            case "statefulset"                    -> client.apps().statefulSets().inNamespace(namespace).withName(name).get();
            case "daemonset"                      -> client.apps().daemonSets().inNamespace(namespace).withName(name).get();
            case "replicaset"                     -> client.apps().replicaSets().inNamespace(namespace).withName(name).get();
            case "pod"                            -> client.pods().inNamespace(namespace).withName(name).get();
            case "service"                        -> client.services().inNamespace(namespace).withName(name).get();
            case "configmap"                      -> client.configMaps().inNamespace(namespace).withName(name).get();
            case "secret"                         -> client.secrets().inNamespace(namespace).withName(name).get();
            case "ingress"                        -> client.network().v1().ingresses().inNamespace(namespace).withName(name).get();
            case "persistentvolumeclaim", "pvc"   -> client.persistentVolumeClaims().inNamespace(namespace).withName(name).get();
            case "serviceaccount"                 -> client.serviceAccounts().inNamespace(namespace).withName(name).get();
            case "horizontalpodautoscaler", "hpa" -> client.autoscaling().v2().horizontalPodAutoscalers().inNamespace(namespace).withName(name).get();
            case "namespace"                      -> client.namespaces().withName(name).get();
            case "node"                           -> client.nodes().withName(name).get();
            default -> null;
        };
    }

    /** Remove fields that are noisy or counterproductive in a YAML editor. */
    private void stripEditorNoise(HasMetadata resource) {
        var meta = resource.getMetadata();
        if (meta == null) return;
        meta.setManagedFields(null);
        if (meta.getAnnotations() != null) {
            meta.getAnnotations().remove("kubectl.kubernetes.io/last-applied-configuration");
        }
    }

    /**
     * Uses SnakeYAML to strip the {@code status} key from the top-level map so the
     * editor only shows spec-level fields.
     */
    @SuppressWarnings("unchecked")
    private String cleanYamlForEditor(String raw) {
        try {
            Map<String, Object> doc = new Yaml().load(raw);
            doc.remove("status");
            DumperOptions opts = new DumperOptions();
            opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
            opts.setIndent(2);
            return new Yaml(opts).dump(doc);
        } catch (Exception e) {
            return raw; // fall back to original if parsing fails
        }
    }



    private boolean isOwnedBy(HasMetadata resource, String ownerUid) {
        if (resource.getMetadata() == null || resource.getMetadata().getOwnerReferences() == null)
            return false;
        for (OwnerReference ref : resource.getMetadata().getOwnerReferences()) {
            if (ownerUid.equals(ref.getUid())) return true;
        }
        return false;
    }

    private int parseRevision(Map<String, String> annotations, String key) {
        if (annotations == null) return 0;
        String val = annotations.get(key);
        if (val == null) return 0;
        try { return Integer.parseInt(val); } catch (NumberFormatException e) { return 0; }
    }

    private String annotationOrNone(Map<String, String> annotations, String key) {
        if (annotations == null) return "<none>";
        String val = annotations.get(key);
        return (val != null && !val.isBlank()) ? val : "<none>";
    }

    private boolean isAllNamespaces(String namespace) {
        return namespace == null || namespace.isBlank() || "all".equalsIgnoreCase(namespace);
    }
}
