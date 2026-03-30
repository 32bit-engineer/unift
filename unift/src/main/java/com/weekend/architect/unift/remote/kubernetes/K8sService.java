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

    /**
     * Lists services, optionally filtered by namespace.
     */
    ServicePage listServices(String sessionId, UUID userId, String namespace);

    /**
     * Lists nodes in the cluster.
     */
    NodePage listNodes(String sessionId, UUID userId);
}
