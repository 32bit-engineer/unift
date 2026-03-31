package com.weekend.architect.unift.remote.ssh;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
import com.jcraft.jsch.UserInfo;
import com.weekend.architect.unift.common.stream.ProgressTrackingInputStream;
import com.weekend.architect.unift.common.utils.StringUtils;
import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.core.AbstractRemoteConnection;
import com.weekend.architect.unift.remote.core.CancellationToken;
import com.weekend.architect.unift.remote.core.PortForwardable;
import com.weekend.architect.unift.remote.core.RemoteShell;
import com.weekend.architect.unift.remote.core.TransferProgressCallback;
import com.weekend.architect.unift.remote.credentials.RemoteCredentials;
import com.weekend.architect.unift.remote.credentials.SshKeyCredentials;
import com.weekend.architect.unift.remote.credentials.SshKeyPassphraseCredentials;
import com.weekend.architect.unift.remote.credentials.SshPasswordCredentials;
import com.weekend.architect.unift.remote.enums.FileType;
import com.weekend.architect.unift.remote.enums.SessionState;
import com.weekend.architect.unift.remote.exception.BrowseException;
import com.weekend.architect.unift.remote.exception.ConnectionException;
import com.weekend.architect.unift.remote.exception.CredentialValidationException;
import com.weekend.architect.unift.remote.exception.RemotePermissionDeniedException;
import com.weekend.architect.unift.remote.exception.SessionExpiredException;
import com.weekend.architect.unift.remote.exception.TransferException;
import com.weekend.architect.unift.remote.model.PasswordUserInfo;
import com.weekend.architect.unift.remote.model.RemoteFile;
import com.weekend.architect.unift.remote.model.RemoteSession;
import com.weekend.architect.unift.remote.stream.ChannelClosingInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

/**
 * SSH/SFTP implementation of {@link com.weekend.architect.unift.remote.core.RemoteConnection}.
 *
 * <p>Uses the <a href="https://github.com/mwiede/jsch">mwiede/jsch</a> fork of JSch
 * for SSH transport and SFTP file operations.
 *
 * <h6>Thread-safety</h6>
 * <p>A single {@link ChannelSftp} is kept open for the lifetime of the session.
 * All SFTP operations are {@code synchronized} on the channel instance to prevent
 * concurrent access from multiple request threads.
 *
 * <h6>Connection lifecycle</h6>
 * <pre>
 *   doConnect() → open JSch Session → open ChannelSftp
 *   doClose()   → disconnect ChannelSftp → disconnect Session
 * </pre>
 */
@Slf4j
public class SshRemoteConnection extends AbstractRemoteConnection implements RemoteShell, PortForwardable {

    /** POSIX path separator — remote hosts are always Unix-like. */
    private static final String PATH_SEP = "/";

    private Session jschSession;
    private ChannelSftp sftpChannel;

    /** Dedicated lock — avoids synchronization on a non-final field. */
    private final Object channelLock = new Object();

    public SshRemoteConnection(RemoteSession session, RemoteConnectionProperties props) {
        super(session, props);
    }

    @Override
    protected void validateCredentials(RemoteCredentials credentials) {
        if (!(credentials instanceof SshPasswordCredentials
                || credentials instanceof SshKeyCredentials
                || credentials instanceof SshKeyPassphraseCredentials)) {
            throw new CredentialValidationException("SshRemoteConnection requires SSH credential types, got: "
                    + credentials.getClass().getSimpleName());
        }
        if (credentials.getHost() == null || credentials.getHost().isBlank()) {
            throw new CredentialValidationException("SSH host must not be blank");
        }
        if (credentials.getPort() < 1 || credentials.getPort() > 65535) {
            throw new CredentialValidationException("SSH port must be between 1 and 65535");
        }
    }

    @Override
    protected void doConnect(RemoteCredentials credentials) throws Exception {
        var jsch = new JSch();
        log.debug(
                "[{}] Initializing JSch for SSH connection to {}:{}",
                session.getSessionId(),
                credentials.getHost(),
                credentials.getPort());

        // --- auth-method dispatch using sealed-class pattern matching ---
        String username =
                switch (credentials) {
                    case SshPasswordCredentials pw -> {
                        log.debug(
                                "[{}] Using password authentication for user: {}",
                                session.getSessionId(),
                                pw.getUsername());
                        jschSession = jsch.getSession(pw.getUsername(), pw.getHost(), pw.getPort());
                        jschSession.setPassword(pw.getPassword());
                        // Required for servers that use keyboard-interactive (PAM) instead of
                        // the plain "password" auth method (common on Ubuntu/Debian with UsePAM yes).
                        jschSession.setUserInfo(new PasswordUserInfo(pw.getPassword()));
                        yield pw.getUsername();
                    }
                    case SshKeyCredentials key -> {
                        log.debug(
                                "[{}] Using private key authentication for user: {}",
                                session.getSessionId(),
                                key.getUsername());
                        jsch.addIdentity(
                                "key-" + session.getSessionId(),
                                key.getPrivateKeyPem().getBytes(StandardCharsets.UTF_8),
                                null,
                                null);
                        jschSession = jsch.getSession(key.getUsername(), key.getHost(), key.getPort());
                        yield key.getUsername();
                    }
                    case SshKeyPassphraseCredentials keyPass -> {
                        log.debug(
                                "[{}] Using passphrase-protected key authentication for user: {}",
                                session.getSessionId(),
                                keyPass.getUsername());
                        jsch.addIdentity(
                                "key-" + session.getSessionId(),
                                keyPass.getPrivateKeyPem().getBytes(StandardCharsets.UTF_8),
                                null,
                                keyPass.getPassphrase().getBytes(StandardCharsets.UTF_8));
                        jschSession = jsch.getSession(keyPass.getUsername(), keyPass.getHost(), keyPass.getPort());
                        yield keyPass.getUsername();
                    }
                    // These should never reach here – ConnectionFactory guards protocol type
                    default -> throw new ConnectionException("Unsupported SSH credential type");
                };

        // Set host key checking based on user preference
        if (!credentials.isStrictHostKeyChecking()) {
            jschSession.setConfig("StrictHostKeyChecking", "no");
        } else {
            jschSession.setConfig("StrictHostKeyChecking", "yes");
            if (!StringUtils.isBlank(credentials.getExpectedFingerprint())) {
                // Given fingerprint is provided, use a custom repository to validate it
                jsch.setHostKeyRepository(new FingerprintHostKeyRepository(credentials.getExpectedFingerprint()));
            }
        }
        // Include keyboard-interactive so PAM-based servers (Ubuntu/Debian with UsePAM yes)
        // work alongside servers that use the plain "password" method.
        jschSession.setConfig("PreferredAuthentications", "publickey,keyboard-interactive,password");

        log.info(
                "[{}] Connecting to SSH server: {}@{}:{}",
                session.getSessionId(),
                username,
                credentials.getHost(),
                credentials.getPort());
        try {
            // TCP-level keep-alive (OS sends ACK probes — works even when app-level traffic is silent)
            jschSession.setConfig("TCPKeepAlive", "yes");
            // SSH-level keep-alive: send an SSH_MSG_GLOBAL_REQUEST every N ms.
            // Use a value well below the shortest expected firewall/NAT idle timeout.
            jschSession.setServerAliveInterval(props.getSshKeepAliveIntervalMs());
            jschSession.setServerAliveCountMax(props.getSshKeepAliveCountMax());
            jschSession.connect(props.getConnectTimeoutMs());
            log.info("[{}]  SSH session established", session.getSessionId());
        } catch (Exception e) {
            log.error("[{}]  SSH connection failed: {}", session.getSessionId(), e.getMessage(), e);
            throw e;
        }

        // Open the persistent SFTP channel
        log.debug("[{}] Opening SFTP channel...", session.getSessionId());
        try {
            ChannelSftp channel = (ChannelSftp) jschSession.openChannel("sftp");
            channel.connect(props.getChannelTimeoutMs());
            this.sftpChannel = channel;
            log.info("[{}]  SFTP channel opened successfully for user '{}'", session.getSessionId(), username);
        } catch (Exception e) {
            log.error("[{}]  Failed to open SFTP channel: {}", session.getSessionId(), e.getMessage(), e);
            throw e;
        }
    }

    @Override
    protected void doClose() {
        if (sftpChannel != null && sftpChannel.isConnected()) {
            log.debug("[{}] Disconnecting SFTP channel", session.getSessionId());
            sftpChannel.disconnect();
            log.debug("[{}]  SFTP channel disconnected", session.getSessionId());
        }
        if (jschSession != null && jschSession.isConnected()) {
            log.debug("[{}] Disconnecting SSH session", session.getSessionId());
            jschSession.disconnect();
            log.info("[{}]  SSH session closed", session.getSessionId());
        }
    }

    @Override
    protected void preClose() {
        log.debug("[{}] Preparing to close SSH connection", session.getSessionId());
    }

    /**
     * Opens a local-to-remote port forward through the JSch session.
     * Passing {@code 0} lets the OS pick a free port; the bound port is returned.
     *
     * <p>Used by {@code K8sClientPool} to tunnel Kubernetes API traffic when the
     * API server is not directly reachable from the UniFT host.
     */
    @Override
    public int forwardLocalPort(String remoteHost, int remotePort) throws Exception {
        if (jschSession == null || !jschSession.isConnected()) {
            throw new IllegalStateException("SSH session is not connected");
        }
        int assignedPort = jschSession.setPortForwardingL(0, remoteHost, remotePort);
        log.info(
                "[{}] SSH port forward established: localhost:{} → {}:{}",
                session.getSessionId(),
                assignedPort,
                remoteHost,
                remotePort);
        return assignedPort;
    }

    /** Tears down a port forward previously opened by {@link #forwardLocalPort}. */
    @Override
    public void cancelPortForward(int localPort) {
        if (jschSession == null || !jschSession.isConnected()) return;
        try {
            jschSession.delPortForwardingL(localPort);
            log.info("[{}] SSH port forward on localhost:{} released", session.getSessionId(), localPort);
        } catch (Exception e) {
            log.warn(
                    "[{}] Failed to release port forward on {}: {}", session.getSessionId(), localPort, e.getMessage());
        }
    }

    /**
     * Detects the remote OS by running a short exec command over the existing SSH session.
     *
     * <p>Strategy (in order):
     * <ol>
     *   <li>Read {@code PRETTY_NAME} from {@code /etc/os-release} — covers all modern
     *       Linux distros (Ubuntu, Debian, Fedora, RHEL, Alpine, …).</li>
     *   <li>Fall back to {@code uname -sr} — covers macOS, BSDs, and older Linux.</li>
     *   <li>Return {@code "SSH Server"} if both commands fail or produce empty output.</li>
     * </ol>
     *
     * <p>This method must never throw; all errors are logged as warnings.
     */
    @Override
    public String detectRemoteOs() {
        if (!isConnected()) {
            return null;
        }
        try {
            // /etc/os-release is present on virtually all systemd-based Linux distros
            String os = runCommand("grep -s PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '\"'");
            if (!os.isBlank()) {
                log.debug("[{}] Detected remote OS via /etc/os-release: {}", session.getSessionId(), os);
                return os;
            }
            // Fallback: kernel name + release — Linux, macOS, BSDs
            os = runCommand("uname -sr 2>/dev/null");
            if (!os.isBlank()) {
                log.debug("[{}] Detected remote OS via uname: {}", session.getSessionId(), os);
                return os;
            }
        } catch (Exception e) {
            log.warn("[{}] Remote OS detection failed (non-critical): {}", session.getSessionId(), e.getMessage());
        }
        return "SSH Server";
    }

    /**
     * Public implementation of {@link RemoteShell#executeCommand} — delegates to
     * the internal {@link #runCommand} after asserting the session is active.
     * Used by the analytics layer for system-metric probes.
     */
    @Override
    public String executeCommand(String command) throws Exception {
        assertActive();
        return runCommand(command);
    }

    /**
     * Returns the first entry of the configured SSH client-to-server cipher preference
     * list (e.g. {@code "chacha20-poly1305@openssh.com"}).  This approximates the
     * actually-negotiated cipher; JSch does not expose the negotiated value via a
     * public API.  Returns {@code null} when the session is not yet connected.
     */
    public String getCipherName() {
        if (jschSession == null) return null;
        String list = jschSession.getConfig("cipher.c2s");
        if (list == null || list.isBlank()) return null;
        return list.split(",")[0].trim();
    }

    /**
     * Opens a short-lived exec channel on the existing SSH session, runs {@code command},
     * reads stdout, and returns the trimmed result.
     *
     * <h6>Read strategy</h6>
     * <p>JSch's {@code ChannelExec} delivers stdout via an internal
     * {@code PipedInputStream}.  Two termination modes exist:
     *
     * <ol>
     *   <li><b>Channel closes normally</b> — the remote shell exits, the SSH server
     *       sends {@code SSH_MSG_CHANNEL_EOF} (which closes the pipe's write-side)
     *       then {@code SSH_MSG_CHANNEL_CLOSE} ({@code exec.isClosed() == true}).
     *       At that point a <em>blocking</em> {@code in.read()} will drain any
     *       remaining buffered bytes and then return {@code -1}.</li>
     *   <li><b>Channel stays open</b> — a backgrounder process (e.g. {@code socat})
     *       inherits the channel's file descriptors and keeps it alive.  The echo
     *       output arrives well before the deadline; the polling loop reads it via
     *       {@code in.available()}.  When the deadline fires we return whatever
     *       was collected.</li>
     * </ol>
     *
     * <h6>Why not {@code !exec.isConnected()}?</h6>
     * <p>{@code isConnected()} is cleared inside {@code disconnect()}, which also
     * calls {@code io.close()} — closing the {@code PipedInputStream} itself.
     * Attempting {@code in.available()} or {@code in.read()} after that returns 0
     * or throws, silently losing any buffered data.  {@code isClosed()} is set by
     * the SSH {@code CLOSE} packet handler <em>before</em> {@code disconnect()} runs,
     * so the pipe is still readable.
     *
     * @param command shell command to execute on the remote host
     * @return trimmed stdout, or an empty string if the command produced no output
     */
    private String runCommand(String command) throws JSchException, IOException {
        ChannelExec exec = (ChannelExec) jschSession.openChannel("exec");
        try {
            exec.setCommand(command);
            exec.setErrStream(null);
            InputStream in = exec.getInputStream();
            exec.connect(props.getChannelTimeoutMs());

            byte[] buf = new byte[4096];
            StringBuilder sb = new StringBuilder();
            long deadline = System.currentTimeMillis() + Math.max(props.getChannelTimeoutMs(), 30_000L);

            while (!exec.isClosed()) {
                if (System.currentTimeMillis() > deadline) break;
                while (in.available() > 0) {
                    int n = in.read(buf, 0, buf.length);
                    if (n < 0) break;
                    sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                }
                try {
                    Thread.sleep(50);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }

            if (exec.isClosed()) {
                int n;
                while ((n = in.read(buf, 0, buf.length)) != -1) {
                    sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                }
            } else {
                while (in.available() > 0) {
                    int n = in.read(buf, 0, buf.length);
                    if (n <= 0) break;
                    sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                }
            }

            return sb.toString().trim();
        } finally {
            exec.disconnect();
        }
    }

    @Override
    public ShellSession openShell(String termType, int cols, int rows) throws Exception {
        assertActive();
        log.info(
                "[{}] Opening interactive shell (term={}, cols={}, rows={})",
                session.getSessionId(),
                termType,
                cols,
                rows);

        ChannelShell shell = (ChannelShell) jschSession.openChannel("shell");
        shell.setPtyType(termType);
        shell.setPtySize(cols, rows, cols * 8, rows * 16); // Approximate pixel sizes

        return new JSchShellSession(shell);
    }

    /**
     * Internal implementation of {@link ShellSession} for JSch.
     */
    private static class JSchShellSession implements ShellSession {
        private final ChannelShell channel;
        private final InputStream stdout;
        private final OutputStream stdin;

        JSchShellSession(ChannelShell channel) throws IOException, JSchException {
            this.channel = channel;
            this.stdout = channel.getInputStream();
            this.stdin = channel.getOutputStream();
            this.channel.connect();
        }

        @Override
        public InputStream getStdout() {
            return stdout;
        }

        @Override
        public OutputStream getStdin() {
            return stdin;
        }

        @Override
        public void resize(int cols, int rows) {
            if (channel.isConnected()) {
                channel.setPtySize(cols, rows, cols * 8, rows * 16);
            }
        }

        @Override
        public void close() {
            if (channel.isConnected()) {
                channel.disconnect();
            }
        }
    }

    /**
     * Pre-flight check called at the top of every SFTP operation that uses the
     * shared {@link #sftpChannel}.  Detects a silently-dropped connection
     * (e.g. NAT/firewall idle timeout) <em>before</em> submitting work to JSch,
     * so we get a clean 410 rather than an obscure "Pipe closed" 502.
     */
    private void assertSftpChannelAlive() {
        if (jschSession == null || !jschSession.isConnected()) {
            log.warn("[{}] SSH session is no longer connected", session.getSessionId());
            session.setState(SessionState.ERROR);
            throw new SessionExpiredException(session.getSessionId());
        }
        if (sftpChannel == null || !sftpChannel.isConnected()) {
            log.warn("[{}] SFTP channel is no longer connected", session.getSessionId());
            session.setState(SessionState.ERROR);
            throw new SessionExpiredException(session.getSessionId());
        }
    }

    /**
     * Called inside every SFTP {@code catch} block.  If the root cause is a
     * broken-pipe / closed-pipe {@link IOException} (the signature of a silently
     * dropped idle connection), the session is marked {@code ERROR} and a
     * {@link SessionExpiredException} (→ HTTP 410) is thrown so the client knows
     * to reconnect.  If the exception is unrelated, this method does nothing.
     */
    private void guardDeadPipe(Throwable t) {
        Throwable cause = t;
        while (cause != null) {
            String msg = cause.getMessage();
            if (msg != null
                    && (msg.contains("Pipe closed")
                            || msg.contains("Broken pipe")
                            || msg.contains("Connection reset by peer"))) {
                log.warn(
                        "[{}] SSH pipe broken ({}); marking session as ERROR so client reconnects",
                        session.getSessionId(),
                        msg);
                session.setState(SessionState.ERROR);
                throw new SessionExpiredException(session.getSessionId());
            }
            cause = cause.getCause();
        }
    }

    // DirectoryBrowsable

    @Override
    public List<RemoteFile> list(String remotePath) throws BrowseException {
        assertActive();
        assertSftpChannelAlive();
        log.debug("[{}] Listing directory: {}", session.getSessionId(), remotePath);
        try {
            synchronized (channelLock) {
                List<ChannelSftp.LsEntry> entries = new ArrayList<>(sftpChannel.ls(remotePath));
                List<RemoteFile> files = entries.stream()
                        .filter(e ->
                                !e.getFilename().equals(".") && !e.getFilename().equals(".."))
                        .map(e -> mapEntry(remotePath, e))
                        .toList();
                log.debug("[{}]  Listed {} entries in {}", session.getSessionId(), files.size(), remotePath);
                return files;
            }
        } catch (SftpException e) {
            guardDeadPipe(e);
            guardPermission(e, remotePath);
            log.error("[{}]  Failed to list directory '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new BrowseException("Failed to list directory '" + remotePath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String remotePath) throws BrowseException {
        assertActive();
        assertSftpChannelAlive();
        log.info("[{}] Deleting: {}", session.getSessionId(), remotePath);
        try {
            synchronized (channelLock) {
                SftpATTRS attrs = sftpChannel.stat(remotePath);
                if (attrs.isDir()) {
                    sftpChannel.rmdir(remotePath);
                    log.info("[{}]  Deleted directory: {}", session.getSessionId(), remotePath);
                } else {
                    sftpChannel.rm(remotePath);
                    log.info("[{}]  Deleted file: {}", session.getSessionId(), remotePath);
                }
            }
        } catch (SftpException e) {
            guardDeadPipe(e);
            guardPermission(e, remotePath);
            log.error("[{}]  Failed to delete '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new BrowseException("Failed to delete '" + remotePath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public void rename(String remotePath, String newPath) throws BrowseException {
        assertActive();
        assertSftpChannelAlive();
        log.info("[{}] Renaming: {} → {}", session.getSessionId(), remotePath, newPath);
        try {
            synchronized (channelLock) {
                sftpChannel.rename(remotePath, newPath);
                log.info("[{}]  Renamed successfully", session.getSessionId());
            }
        } catch (SftpException e) {
            guardDeadPipe(e);
            guardPermission(e, remotePath);
            log.error(
                    "[{}]  Failed to rename '{}' to '{}': {}",
                    session.getSessionId(),
                    remotePath,
                    newPath,
                    e.getMessage(),
                    e);
            throw new BrowseException(
                    "Failed to rename '" + remotePath + "' to '" + newPath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public void mkdir(String remotePath) throws BrowseException {
        assertActive();
        assertSftpChannelAlive();
        log.info("[{}] Creating directory: {}", session.getSessionId(), remotePath);
        try {
            synchronized (channelLock) {
                sftpChannel.mkdir(remotePath);
                log.info("[{}]  Directory created: {}", session.getSessionId(), remotePath);
            }
        } catch (SftpException e) {
            guardDeadPipe(e);
            guardPermission(e, remotePath);
            log.error(
                    "[{}]  Failed to create directory '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new BrowseException("Failed to create directory '" + remotePath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public String homeDirectory() throws BrowseException {
        assertActive();
        assertSftpChannelAlive();
        log.debug("[{}] Resolving home directory", session.getSessionId());
        try {
            synchronized (channelLock) {
                String home = sftpChannel.getHome();
                log.debug("[{}]  Home directory: {}", session.getSessionId(), home);
                return home;
            }
        } catch (SftpException e) {
            guardDeadPipe(e);
            guardPermission(e, "~");
            log.error("[{}]  Failed to determine home directory: {}", session.getSessionId(), e.getMessage(), e);
            throw new BrowseException("Failed to determine home directory: " + e.getMessage(), e);
        }
    }

    // FileTransferable

    @Override
    public void upload(
            String remotePath,
            InputStream source,
            long fileSize,
            TransferProgressCallback callback,
            CancellationToken cancellationToken)
            throws TransferException {
        assertActive();
        log.info("[{}] Upload starting → '{}' ({} bytes)", session.getSessionId(), remotePath, fileSize);

        ChannelSftp uploadChannel = null;
        try {
            uploadChannel = (ChannelSftp) jschSession.openChannel("sftp");
            uploadChannel.connect(props.getChannelTimeoutMs());
            uploadChannel.put(
                    source,
                    remotePath,
                    new JschSftpProgressMonitor(callback, cancellationToken),
                    ChannelSftp.OVERWRITE);
            log.info("[{}] Upload complete → '{}'", session.getSessionId(), remotePath);
        } catch (SftpException e) {
            guardDeadPipe(e);
            guardPermission(e, remotePath);
            log.error("[{}] Upload failed → '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Upload to '" + remotePath + "' failed: " + e.getMessage(), e);
        } catch (Exception e) {
            guardDeadPipe(e);
            log.error("[{}] Upload failed → '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Upload to '" + remotePath + "' failed: " + e.getMessage(), e);
        } finally {
            disconnectQuietly(uploadChannel);
        }
    }

    @Override
    public InputStream download(String remotePath, TransferProgressCallback callback) throws TransferException {
        assertActive();
        log.info("[{}] ⬇️  Download starting ← '{}'", session.getSessionId(), remotePath);

        // Open a *dedicated* ChannelSftp for this download — never reuse the shared sftpChannel.
        //
        // JSch's SFTP InputStream is backed by an internal PipedInputStream tied to the channel.
        // If two concurrent requests both call sftpChannel.get() on the same ChannelSftp —
        // even if the get() calls are serialized by channelLock — the second stream's pipe
        // setup overwrites the first stream's pipe state while it is still being drained.
        // Whichever stream reads or closes next gets "inputstream is closed".
        //
        // A JSch Session multiplexes many Channels over a single TCP/SSH connection, so
        // opening a fresh ChannelSftp per download is correct and inexpensive.
        // ChannelClosingInputStream guarantees the dedicated channel is disconnected when
        // the caller closes the stream (or on error).
        ChannelSftp downloadChannel = null;
        try {
            downloadChannel = (ChannelSftp) jschSession.openChannel("sftp");
            downloadChannel.connect(props.getChannelTimeoutMs());

            // Omit the SftpProgressMonitor overload to skip JSch's internal _stat() call.
            // get(path, monitor) calls _stat() first, which triggers an IndexOutOfBoundsException
            // in mwiede/jsch 0.2.x + certain OpenSSH server versions. Progress is tracked via
            // ProgressTrackingInputStream instead.
            InputStream raw = downloadChannel.get(remotePath);
            InputStream tracked = new ProgressTrackingInputStream(raw, callback);

            log.info("[{}] Download stream opened ← '{}'", session.getSessionId(), remotePath);
            return new ChannelClosingInputStream(tracked, downloadChannel);

        } catch (SftpException e) {
            disconnectQuietly(downloadChannel);
            guardDeadPipe(e);
            guardPermission(e, remotePath);
            log.error("[{}] Download failed ← '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Download from '" + remotePath + "' failed: " + e.getMessage(), e);
        } catch (Exception e) {
            disconnectQuietly(downloadChannel);
            guardDeadPipe(e);
            log.error("[{}] Download failed ← '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Download from '" + remotePath + "' failed: " + e.getMessage(), e);
        }
    }

    // Helpers

    /**
     * Checks whether a {@link SftpException} represents a remote permission denial
     * (SFTP status code {@code SSH_FX_PERMISSION_DENIED = 3}) and, if so, throws
     * {@link RemotePermissionDeniedException} immediately — before the caller wraps
     * the error in a generic {@link BrowseException} or {@link TransferException}.
     *
     * <p>This ensures the {@code GlobalExceptionHandler} can distinguish a real
     * Unix filesystem permission denial (→ 403 Forbidden) from a genuine gateway
     * failure (→ 502 Bad Gateway).
     */
    private void guardPermission(SftpException e, String path) {
        if (e.id == ChannelSftp.SSH_FX_PERMISSION_DENIED) {
            log.warn("[{}] ⛔ Permission denied on remote host: '{}'", session.getSessionId(), path);
            throw new RemotePermissionDeniedException(path);
        }
    }

    /** Disconnects a {@link ChannelSftp} silently; safe to call with {@code null}. */
    private static void disconnectQuietly(ChannelSftp channel) {
        if (channel != null && channel.isConnected()) {
            channel.disconnect();
        }
    }

    private RemoteFile mapEntry(String parentPath, ChannelSftp.LsEntry entry) {
        SftpATTRS attrs = entry.getAttrs();
        String name = entry.getFilename();
        String fullPath = parentPath.endsWith(PATH_SEP) ? parentPath + name : parentPath + PATH_SEP + name;

        FileType type;
        if (attrs.isDir()) {
            type = FileType.DIRECTORY;
        } else if (attrs.isLink()) {
            type = FileType.SYMLINK;
        } else if (attrs.isReg()) {
            type = FileType.FILE;
        } else {
            type = FileType.OTHER;
        }

        OffsetDateTime lastModified = OffsetDateTime.ofInstant(Instant.ofEpochSecond(attrs.getMTime()), ZoneOffset.UTC);

        // longname example: "-rwxr-xr-x  1 ubuntu ubuntu 4096 Mar 15 10:00 filename"
        String permissions =
                entry.getLongname().length() >= 10 ? entry.getLongname().substring(0, 10) : "";

        // For directories the OS-reported size is the directory-inode metadata block
        // (typically 4096B on ext4), which is misleading because it is always far
        // smaller than the actual total of the directory's contents. We use -1 to
        // signal "size not computed" so the UI can display "—" instead of a
        // confusingly small number.
        long sizeBytes = (type == FileType.DIRECTORY) ? -1L : attrs.getSize();

        return RemoteFile.builder()
                .name(name)
                .path(fullPath)
                .type(type)
                .sizeBytes(sizeBytes)
                .lastModified(lastModified)
                .permissions(permissions)
                .owner(String.valueOf(attrs.getUId()))
                .hidden(name.startsWith("."))
                .build();
    }

    /**
     * Custom {@link HostKeyRepository} that validates the server's public key fingerprint
     * against a single expected value provided by the user.
     */
    private static final class FingerprintHostKeyRepository implements HostKeyRepository {
        private final String expectedFingerprint;

        FingerprintHostKeyRepository(String expectedFingerprint) {
            this.expectedFingerprint = expectedFingerprint;
        }

        @Override
        public int check(String host, byte[] key) {
            try {
                // Create a temporary HostKey to calculate the fingerprint
                HostKey hk = new HostKey(host, key);
                String actualFingerprint = hk.getFingerPrint(new JSch());

                if (actualFingerprint.equalsIgnoreCase(expectedFingerprint)) {
                    log.debug("SSH host key fingerprint matches expected value: {}", expectedFingerprint);
                    return OK;
                } else {
                    log.warn(
                            "SSH host key fingerprint mismatch! Expected: {}, Actual: {}",
                            expectedFingerprint,
                            actualFingerprint);
                    return NOT_INCLUDED;
                }
            } catch (Exception e) {
                log.error("Error verifying SSH host key fingerprint", e);
                return NOT_INCLUDED;
            }
        }

        @Override
        public void add(HostKey hostkey, UserInfo ui) {
            // ignored
        }

        @Override
        public void remove(String host, String type) {
            // ignored
        }

        @Override
        public void remove(String host, String type, byte[] key) {
            // ignored
        }

        @Override
        public String getKnownHostsRepositoryID() {
            return "unift-dynamic-repo";
        }

        @Override
        public HostKey[] getHostKey() {
            return new HostKey[0];
        }

        @Override
        public HostKey[] getHostKey(String host, String type) {
            return new HostKey[0];
        }
    }
}
