package com.weekend.architect.unift.remote.kubernetes;

import com.weekend.architect.unift.remote.kubernetes.K8sModels.DeploymentPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sClusterInfo;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.K8sOverview;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.Namespace;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.NodePage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodActionResult;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.PodPage;
import com.weekend.architect.unift.remote.kubernetes.K8sModels.ServicePage;
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for Kubernetes cluster management.
 * All operations execute kubectl CLI commands on the remote host
 * through the session's SSH connection.
 *
 * Base path: {@code /api/remote/sessions/{sessionId}/k8s}
 */
@RestController
@RequestMapping("/api/remote/sessions/{sessionId}/k8s")
@RequiredArgsConstructor
@SecurityRequirement(name = "BearerAuth")
@Tag(name = "Kubernetes", description = "Kubernetes management via SSH")
public class K8sController {

    private final K8sService k8sService;

    @GetMapping("/status")
    @Operation(summary = "Check kubectl availability on the remote host")
    public ResponseEntity<Map<String, Boolean>> checkKubectl(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        boolean available = k8sService.isKubectlAvailable(sessionId, userId);
        return ResponseEntity.ok(Map.of("available", available));
    }

    @GetMapping("/info")
    @Operation(summary = "Get Kubernetes cluster info")
    public ResponseEntity<K8sClusterInfo> getClusterInfo(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.getClusterInfo(sessionId, userId));
    }

    @GetMapping("/overview")
    @Operation(summary = "Get K8s cluster overview: counts, namespaces, recent pods")
    public ResponseEntity<K8sOverview> getOverview(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.getOverview(sessionId, userId, namespace));
    }

    @GetMapping("/namespaces")
    @Operation(summary = "List all Kubernetes namespaces")
    public ResponseEntity<List<Namespace>> listNamespaces(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.listNamespaces(sessionId, userId));
    }

    @GetMapping("/pods")
    @Operation(summary = "List pods in the cluster")
    public ResponseEntity<PodPage> listPods(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.listPods(sessionId, userId, namespace));
    }

    @GetMapping("/pods/{podName}/logs")
    @Operation(summary = "Get pod logs (tail)")
    public ResponseEntity<Map<String, String>> getPodLogs(
            @PathVariable String sessionId,
            @PathVariable String podName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam(defaultValue = "200") int tail) {

        UUID userId = principal.user().getId();
        String logs = k8sService.getPodLogs(sessionId, userId, namespace, podName, tail);
        return ResponseEntity.ok(Map.of("logs", logs));
    }

    @DeleteMapping("/pods/{podName}")
    @Operation(summary = "Delete a pod (triggers re-creation by its controller)")
    public ResponseEntity<PodActionResult> deletePod(
            @PathVariable String sessionId,
            @PathVariable String podName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.deletePod(sessionId, userId, namespace, podName));
    }

    @GetMapping("/deployments")
    @Operation(summary = "List deployments in the cluster")
    public ResponseEntity<DeploymentPage> listDeployments(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.listDeployments(sessionId, userId, namespace));
    }

    @PostMapping("/deployments/{deploymentName}/scale")
    @Operation(summary = "Scale a deployment to N replicas")
    public ResponseEntity<PodActionResult> scaleDeployment(
            @PathVariable String sessionId,
            @PathVariable String deploymentName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam int replicas) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.scaleDeployment(sessionId, userId, namespace, deploymentName, replicas));
    }

    @PostMapping("/deployments/{deploymentName}/restart")
    @Operation(summary = "Restart a deployment via rollout restart")
    public ResponseEntity<PodActionResult> restartDeployment(
            @PathVariable String sessionId,
            @PathVariable String deploymentName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.restartDeployment(sessionId, userId, namespace, deploymentName));
    }

    @GetMapping("/services")
    @Operation(summary = "List services in the cluster")
    public ResponseEntity<ServicePage> listServices(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.listServices(sessionId, userId, namespace));
    }

    @GetMapping("/nodes")
    @Operation(summary = "List nodes in the cluster")
    public ResponseEntity<NodePage> listNodes(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {

        UUID userId = principal.user().getId();
        return ResponseEntity.ok(k8sService.listNodes(sessionId, userId));
    }
}
