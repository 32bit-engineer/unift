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
import com.weekend.architect.unift.security.UniFtUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * REST controller for Kubernetes cluster management. All operations execute kubectl CLI commands on
 * the remote host through the session's SSH connection.
 *
 * <p>Base path: {@code /api/remote/sessions/{sessionId}/k8s}
 */
@RestController
@RequestMapping("/api/remote/sessions/{sessionId}/k8s")
@RequiredArgsConstructor
@SecurityRequirement(name = "BearerAuth")
@Tag(name = "Kubernetes", description = "Kubernetes management via SSH")
public class K8sController {

    private final K8sService k8sService;

    @GetMapping("/status")
    @Operation(summary = "Check Kubernetes API server connectivity")
    public ResponseEntity<Map<String, Boolean>> checkKubectl(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        boolean available =
                k8sService.isKubectlAvailable(sessionId, principal.user().getId());
        return ResponseEntity.ok(Map.of("available", available));
    }

    @GetMapping("/info")
    @Operation(summary = "Get Kubernetes cluster version and name")
    public ResponseEntity<K8sClusterInfo> getClusterInfo(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                k8sService.getClusterInfo(sessionId, principal.user().getId()));
    }

    @GetMapping("/overview")
    @Operation(summary = "Full cluster overview: counts, namespaces, recent pods")
    public ResponseEntity<K8sOverview> getOverview(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.getOverview(sessionId, principal.user().getId(), namespace));
    }

    @GetMapping("/namespaces")
    @Operation(summary = "List all namespaces")
    public ResponseEntity<List<Namespace>> listNamespaces(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                k8sService.listNamespaces(sessionId, principal.user().getId()));
    }

    @GetMapping("/pods")
    @Operation(summary = "List pods, optionally filtered by namespace")
    public ResponseEntity<PodPage> listPods(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(k8sService.listPods(sessionId, principal.user().getId(), namespace));
    }

    @GetMapping("/pods/{podName}/logs")
    @Operation(summary = "Get pod logs (tail N lines)")
    public ResponseEntity<Map<String, String>> getPodLogs(
            @PathVariable String sessionId,
            @PathVariable String podName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam(defaultValue = "200") int tail) {
        String logs = k8sService.getPodLogs(sessionId, principal.user().getId(), namespace, podName, tail);
        return ResponseEntity.ok(Map.of("logs", logs));
    }

    @GetMapping(value = "/pods/{podName}/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Stream pod logs (follow mode) via Server-Sent Events — one line per data" + " event")
    public SseEmitter streamPodLogs(
            @PathVariable String sessionId,
            @PathVariable String podName,
            @RequestHeader(value = "container", required = false, defaultValue = "") String containerName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam(defaultValue = "100") int tail) {
        return k8sService.streamPodLogs(sessionId, principal.user().getId(), namespace, podName, containerName, tail);
    }

    @DeleteMapping("/pods/{podName}")
    @Operation(summary = "Delete a pod (triggers re-creation by its controller)")
    public ResponseEntity<PodActionResult> deletePod(
            @PathVariable String sessionId,
            @PathVariable String podName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {
        return ResponseEntity.ok(
                k8sService.deletePod(sessionId, principal.user().getId(), namespace, podName));
    }

    @GetMapping("/deployments")
    @Operation(summary = "List deployments")
    public ResponseEntity<DeploymentPage> listDeployments(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.listDeployments(sessionId, principal.user().getId(), namespace));
    }

    @PostMapping("/deployments/{deploymentName}/scale")
    @Operation(summary = "Scale a deployment")
    public ResponseEntity<PodActionResult> scaleDeployment(
            @PathVariable String sessionId,
            @PathVariable String deploymentName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam @Min(0) @Max(100) int replicas) {
        return ResponseEntity.ok(
                k8sService.scaleDeployment(sessionId, principal.user().getId(), namespace, deploymentName, replicas));
    }

    @PostMapping("/deployments/{deploymentName}/restart")
    @Operation(summary = "Rolling-restart a deployment")
    public ResponseEntity<PodActionResult> restartDeployment(
            @PathVariable String sessionId,
            @PathVariable String deploymentName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {
        return ResponseEntity.ok(
                k8sService.restartDeployment(sessionId, principal.user().getId(), namespace, deploymentName));
    }

    @GetMapping("/deployments/{deploymentName}/rollout/history")
    @Operation(summary = "Get rollout history (revisions) for a deployment")
    public ResponseEntity<RolloutHistoryPage> getRolloutHistory(
            @PathVariable String sessionId,
            @PathVariable String deploymentName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {
        return ResponseEntity.ok(
                k8sService.getRolloutHistory(sessionId, principal.user().getId(), namespace, deploymentName));
    }

    @PostMapping("/deployments/{deploymentName}/rollout/undo")
    @Operation(summary = "Roll back a deployment (revision=0 → previous revision)")
    public ResponseEntity<PodActionResult> undoRollout(
            @PathVariable String sessionId,
            @PathVariable String deploymentName,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam(defaultValue = "0") int revision) {
        return ResponseEntity.ok(
                k8sService.undoRollout(sessionId, principal.user().getId(), namespace, deploymentName, revision));
    }

    @GetMapping("/services")
    @Operation(summary = "List services")
    public ResponseEntity<ServicePage> listServices(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.listServices(sessionId, principal.user().getId(), namespace));
    }

    @GetMapping("/configmaps")
    @Operation(summary = "List ConfigMaps")
    public ResponseEntity<ConfigMapPage> listConfigMaps(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.listConfigMaps(sessionId, principal.user().getId(), namespace));
    }

    @GetMapping("/ingresses")
    @Operation(summary = "List Ingresses (networking.k8s.io/v1)")
    public ResponseEntity<IngressPage> listIngresses(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.listIngresses(sessionId, principal.user().getId(), namespace));
    }

    @GetMapping("/daemonsets")
    @Operation(summary = "List DaemonSets")
    public ResponseEntity<DaemonSetPage> listDaemonSets(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.listDaemonSets(sessionId, principal.user().getId(), namespace));
    }

    @PostMapping("/daemonsets/{name}/restart")
    @Operation(summary = "Rolling-restart a DaemonSet")
    public ResponseEntity<PodActionResult> restartDaemonSet(
            @PathVariable String sessionId,
            @PathVariable String name,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {
        return ResponseEntity.ok(
                k8sService.restartDaemonSet(sessionId, principal.user().getId(), namespace, name));
    }

    @GetMapping("/statefulsets")
    @Operation(summary = "List StatefulSets")
    public ResponseEntity<StatefulSetPage> listStatefulSets(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "") String namespace) {
        return ResponseEntity.ok(
                k8sService.listStatefulSets(sessionId, principal.user().getId(), namespace));
    }

    @PostMapping("/statefulsets/{name}/restart")
    @Operation(summary = "Rolling-restart a StatefulSet")
    public ResponseEntity<PodActionResult> restartStatefulSet(
            @PathVariable String sessionId,
            @PathVariable String name,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace) {
        return ResponseEntity.ok(
                k8sService.restartStatefulSet(sessionId, principal.user().getId(), namespace, name));
    }

    @PostMapping("/statefulsets/{name}/scale")
    @Operation(summary = "Scale a StatefulSet")
    public ResponseEntity<PodActionResult> scaleStatefulSet(
            @PathVariable String sessionId,
            @PathVariable String name,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestParam(defaultValue = "default") String namespace,
            @RequestParam @Min(0) @Max(100) int replicas) {
        return ResponseEntity.ok(
                k8sService.scaleStatefulSet(sessionId, principal.user().getId(), namespace, name, replicas));
    }

    @GetMapping("/nodes")
    @Operation(summary = "List nodes")
    public ResponseEntity<NodePage> listNodes(
            @PathVariable String sessionId, @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                k8sService.listNodes(sessionId, principal.user().getId()));
    }

    @GetMapping("/resources/{kind}/{namespace}/{name}/yaml")
    @Operation(summary = "Get the live YAML for any resource (status and managedFields stripped)")
    public ResponseEntity<ResourceYaml> getResourceYaml(
            @PathVariable String sessionId,
            @PathVariable String kind,
            @PathVariable String namespace,
            @PathVariable String name,
            @AuthenticationPrincipal UniFtUserDetails principal) {
        return ResponseEntity.ok(
                k8sService.getResourceYaml(sessionId, principal.user().getId(), kind, namespace, name));
    }

    @PutMapping(value = "/resources/yaml", consumes = MediaType.TEXT_PLAIN_VALUE)
    @Operation(summary = "Server-side-apply YAML for any resource (works for all kinds)")
    public ResponseEntity<PodActionResult> applyResourceYaml(
            @PathVariable String sessionId,
            @AuthenticationPrincipal UniFtUserDetails principal,
            @RequestBody String yamlContent) {
        return ResponseEntity.ok(
                k8sService.applyResourceYaml(sessionId, principal.user().getId(), yamlContent));
    }
}
