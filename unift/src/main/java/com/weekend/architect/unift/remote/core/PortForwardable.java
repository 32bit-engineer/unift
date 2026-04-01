package com.weekend.architect.unift.remote.core;

/**
 * Capability interface for connections that support SSH local port forwarding.
 *
 * <p>Implementations (e.g. {@code SshRemoteConnection}) bind a local port on the UniFT server and
 * tunnel all traffic through the underlying SSH transport to the specified remote host/port. This
 * is used by {@code K8sClientPool} when the Kubernetes API server is not directly reachable from
 * the UniFT host (e.g. when the kubeconfig points to {@code localhost} or a private
 * cluster-internal IP).
 *
 * <pre>
 * UniFT server:localPort  ──SSH──►  SSH server  ──TCP──►  k8s API server:remotePort
 * </pre>
 */
public interface PortForwardable {

    /**
     * Opens a local port forward through this connection.
     *
     * <p>Passing {@code 0} as the local port lets the OS pick a free port; the actually-bound port
     * is returned.
     *
     * @param remoteHost hostname/IP reachable from the SSH server (not from this host)
     * @param remotePort port on {@code remoteHost} to forward to
     * @return the local port that was bound on this host
     * @throws Exception if the port forward cannot be established
     */
    int forwardLocalPort(String remoteHost, int remotePort) throws Exception;

    /**
     * Tears down a local port forward previously opened by {@link #forwardLocalPort}.
     *
     * @param localPort the local port to release
     */
    void cancelPortForward(int localPort);
}
