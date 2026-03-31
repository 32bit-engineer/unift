package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.kubernetes.K8sModels.ConfigMapPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.DaemonSetPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.DeploymentPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.IngressPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sClusterInfo;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sOverview;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Namespace;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.NodePage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodActionResult;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ResourceYaml;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.RolloutHistoryPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ServicePage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.StatefulSetPage;
import java.util.List;
import java.util.UUID;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Service interface for Kubernetes cluster management via SSH.
 * All operations execute kubectl CLI commands on the remote host
 * through the session's SSH connection.
 */
public interface K8sService {

    /**
     * Checks if kubectl is available and can connect to a cluster.
     */
    boolean isKubectlAvailable(String sessionId, UUID userId);

    /**
     * Returns cluster version and platform info.
     */
    K8sClusterInfo getClusterInfo(String sessionId, UUID userId);

    /**
     * Returns a high-level overview of the cluster: pod/deployment/service/node counts,
     * namespaces, and a sample of recent pods.
     */
    K8sOverview getOverview(String sessionId, UUID userId, String namespace);

    /**
     * Lists all namespaces.
     */
    List<Namespace> listNamespaces(String sessionId, UUID userId);

    /**
     * Lists pods, optionally filtered by namespace.
     */
    PodPage listPods(String sessionId, UUID userId, String namespace);

    /**
     * Returns logs for a specific pod.
     */
    String getPodLogs(String sessionId, UUID userId, String namespace, String podName, int tailLines);

    void streamPodLogs(String sessionId, UUID userId, String namespace, String podName,
        int tailLines, SseEmitter emitter);
    /**
     * Deletes a pod (triggers re-creation by its controller).
     */
    PodActionResult deletePod(String sessionId, UUID userId, String namespace, String podName);

    /**
     * Lists deployments, optionally filtered by namespace.
     */
    DeploymentPage listDeployments(String sessionId, UUID userId, String namespace);

    /**
     * Scales a deployment to the specified replica count.
     */
    PodActionResult scaleDeployment(
            String sessionId, UUID userId, String namespace, String deploymentName, int replicas);

    /**
     * Restarts a deployment by performing a rollout restart.
     */
    PodActionResult restartDeployment(String sessionId, UUID userId, String namespace, String deploymentName);

    /** Lists services, optionally filtered by namespace. */
    ServicePage listServices(String sessionId, UUID userId, String namespace);

    /** Lists nodes in the cluster. */
    NodePage listNodes(String sessionId, UUID userId);


    /** Lists ConfigMaps, optionally filtered by namespace. */
    ConfigMapPage listConfigMaps(String sessionId, UUID userId, String namespace);

    /** Lists Ingresses (networking.k8s.io/v1), optionally filtered by namespace. */
    IngressPage listIngresses(String sessionId, UUID userId, String namespace);

    /** Lists DaemonSets, optionally filtered by namespace. */
    DaemonSetPage listDaemonSets(String sessionId, UUID userId, String namespace);

    /** Rolling-restart a DaemonSet. */
    PodActionResult restartDaemonSet(String sessionId, UUID userId, String namespace, String name);

    /** Lists StatefulSets, optionally filtered by namespace. */
    StatefulSetPage listStatefulSets(String sessionId, UUID userId, String namespace);

    /** Rolling-restart a StatefulSet. */
    PodActionResult restartStatefulSet(String sessionId, UUID userId, String namespace, String name);

    /** Scale a StatefulSet to the given replica count. */
    PodActionResult scaleStatefulSet(String sessionId, UUID userId, String namespace, String name, int replicas);

    // ─── Generic YAML view / edit ─────────────────────────────────────────────

    /**
     * Returns the live YAML for any namespaced resource.
     * {@code managedFields} and {@code status} are stripped for a clean editor view.
     *
     * @param kind      k8s kind, e.g. {@code "Deployment"}, {@code "ConfigMap"}
     * @param namespace resource namespace
     * @param name      resource name
     */
    ResourceYaml getResourceYaml(String sessionId, UUID userId, String kind, String namespace, String name);

    /**
     * Server-side-applies the given YAML, updating the live resource.
     * Works for any resource type — the kind is determined from the YAML itself.
     *
     * @param yamlContent complete YAML document
     */
    PodActionResult applyResourceYaml(String sessionId, UUID userId, String yamlContent);

    // ─── Rollout management ───────────────────────────────────────────────────

    /**
     * Returns the rollout history for a Deployment (derived from its ReplicaSets).
     */
    RolloutHistoryPage getRolloutHistory(String sessionId, UUID userId, String namespace, String deploymentName);

    /**
     * Rolls back a Deployment to the specified revision.
     * Pass {@code revision = 0} to roll back to the previous revision.
     */
    PodActionResult undoRollout(String sessionId, UUID userId, String namespace, String deploymentName, int revision);
}
