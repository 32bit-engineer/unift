package com.weekend.architect.unift.remote.ssh;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;
import com.weekend.architect.unift.common.utils.StringUtils;
import com.weekend.architect.unift.remote.config.RemoteConnectionProperties;
import com.weekend.architect.unift.remote.core.AbstractRemoteConnection;
import com.weekend.architect.unift.remote.core.TransferProgressCallback;
import com.weekend.architect.unift.remote.credentials.RemoteCredentials;
import com.weekend.architect.unift.remote.credentials.SshKeyCredentials;
import com.weekend.architect.unift.remote.credentials.SshKeyPassphraseCredentials;
import com.weekend.architect.unift.remote.credentials.SshPasswordCredentials;
import com.weekend.architect.unift.remote.enums.FileType;
import com.weekend.architect.unift.remote.exception.BrowseException;
import com.weekend.architect.unift.remote.exception.ConnectionException;
import com.weekend.architect.unift.remote.exception.CredentialValidationException;
import com.weekend.architect.unift.remote.exception.RemotePermissionDeniedException;
import com.weekend.architect.unift.remote.exception.TransferException;
import com.weekend.architect.unift.remote.model.RemoteFile;
import com.weekend.architect.unift.remote.model.RemoteSession;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Vector;
import lombok.extern.slf4j.Slf4j;

/**
 * SSH/SFTP implementation of {@link com.weekend.architect.unift.remote.core.RemoteConnection}.
 *
 * <p>Uses the <a href="https://github.com/mwiede/jsch">mwiede/jsch</a> fork of JSch
 * for SSH transport and SFTP file operations.
 *
 * <h2>Thread-safety</h2>
 * <p>A single {@link ChannelSftp} is kept open for the lifetime of the session.
 * All SFTP operations are {@code synchronized} on the channel instance to prevent
 * concurrent access from multiple request threads.
 *
 * <h2>Connection lifecycle</h2>
 * <pre>
 *   doConnect() → open JSch Session → open ChannelSftp
 *   doClose()   → disconnect ChannelSftp → disconnect Session
 * </pre>
 */
@Slf4j
public class SshRemoteConnection extends AbstractRemoteConnection {

    /** POSIX path separator — remote hosts are always Unix-like. */
    private static final String PATH_SEP = "/";

    private JSch jsch;
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
        jsch = new JSch();
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
        if (credentials.isStrictHostKeyChecking()) {
            jschSession.setConfig("StrictHostKeyChecking", "yes");
            if (!StringUtils.isBlank(credentials.getExpectedFingerprint())) {
                // If a fingerprint is provided, use a custom repository to validate it
                jsch.setHostKeyRepository(new FingerprintHostKeyRepository(credentials.getExpectedFingerprint()));
            }
        } else {
            jschSession.setConfig("StrictHostKeyChecking", "no");
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
            // Send a keep-alive every 60 seconds
            jschSession.setServerAliveInterval(60000);
            // If the server doesn't respond to 3 pings in a row, kill the connection
            jschSession.setServerAliveCountMax(3);
            jschSession.connect(props.getConnectTimeoutMs());
            log.info("[{}] ✓ SSH session established", session.getSessionId());
        } catch (Exception e) {
            log.error("[{}] ❌ SSH connection failed: {}", session.getSessionId(), e.getMessage(), e);
            throw e;
        }

        // Open the persistent SFTP channel
        log.debug("[{}] Opening SFTP channel...", session.getSessionId());
        try {
            ChannelSftp channel = (ChannelSftp) jschSession.openChannel("sftp");
            channel.connect(props.getChannelTimeoutMs());
            this.sftpChannel = channel;
            log.info("[{}] ✓ SFTP channel opened successfully for user '{}'", session.getSessionId(), username);
        } catch (Exception e) {
            log.error("[{}] ❌ Failed to open SFTP channel: {}", session.getSessionId(), e.getMessage(), e);
            throw e;
        }
    }

    @Override
    protected void doClose() {
        if (sftpChannel != null && sftpChannel.isConnected()) {
            log.debug("[{}] Disconnecting SFTP channel", session.getSessionId());
            sftpChannel.disconnect();
            log.debug("[{}] ✓ SFTP channel disconnected", session.getSessionId());
        }
        if (jschSession != null && jschSession.isConnected()) {
            log.debug("[{}] Disconnecting SSH session", session.getSessionId());
            jschSession.disconnect();
            log.info("[{}] ✓ SSH session closed", session.getSessionId());
        }
    }

    @Override
    protected void preClose() {
        log.debug("[{}] Preparing to close SSH connection", session.getSessionId());
    }

    // DirectoryBrowsable

    @Override
    public List<RemoteFile> list(String remotePath) throws BrowseException {
        assertActive();
        log.debug("[{}] Listing directory: {}", session.getSessionId(), remotePath);
        try {
            synchronized (channelLock) {
                Vector<ChannelSftp.LsEntry> entries = sftpChannel.ls(remotePath);
                List<RemoteFile> files = entries.stream()
                        .filter(e ->
                                !e.getFilename().equals(".") && !e.getFilename().equals(".."))
                        .map(e -> mapEntry(remotePath, e))
                        .toList();
                log.debug("[{}] ✓ Listed {} entries in {}", session.getSessionId(), files.size(), remotePath);
                return files;
            }
        } catch (SftpException e) {
            guardPermission(e, remotePath);
            log.error(
                    "[{}] ❌ Failed to list directory '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new BrowseException("Failed to list directory '" + remotePath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String remotePath) throws BrowseException {
        assertActive();
        log.info("[{}] Deleting: {}", session.getSessionId(), remotePath);
        try {
            synchronized (channelLock) {
                SftpATTRS attrs = sftpChannel.stat(remotePath);
                if (attrs.isDir()) {
                    sftpChannel.rmdir(remotePath);
                    log.info("[{}] ✓ Deleted directory: {}", session.getSessionId(), remotePath);
                } else {
                    sftpChannel.rm(remotePath);
                    log.info("[{}] ✓ Deleted file: {}", session.getSessionId(), remotePath);
                }
            }
        } catch (SftpException e) {
            guardPermission(e, remotePath);
            log.error("[{}] ❌ Failed to delete '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new BrowseException("Failed to delete '" + remotePath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public void rename(String remotePath, String newPath) throws BrowseException {
        assertActive();
        log.info("[{}] Renaming: {} → {}", session.getSessionId(), remotePath, newPath);
        try {
            synchronized (channelLock) {
                sftpChannel.rename(remotePath, newPath);
                log.info("[{}] ✓ Renamed successfully", session.getSessionId());
            }
        } catch (SftpException e) {
            guardPermission(e, remotePath);
            log.error(
                    "[{}] ❌ Failed to rename '{}' to '{}': {}",
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
        log.info("[{}] Creating directory: {}", session.getSessionId(), remotePath);
        try {
            synchronized (channelLock) {
                sftpChannel.mkdir(remotePath);
                log.info("[{}] ✓ Directory created: {}", session.getSessionId(), remotePath);
            }
        } catch (SftpException e) {
            guardPermission(e, remotePath);
            log.error(
                    "[{}] ❌ Failed to create directory '{}': {}",
                    session.getSessionId(),
                    remotePath,
                    e.getMessage(),
                    e);
            throw new BrowseException("Failed to create directory '" + remotePath + "': " + e.getMessage(), e);
        }
    }

    @Override
    public String homeDirectory() throws BrowseException {
        assertActive();
        log.debug("[{}] Resolving home directory", session.getSessionId());
        try {
            synchronized (channelLock) {
                String home = sftpChannel.getHome();
                log.debug("[{}] ✓ Home directory: {}", session.getSessionId(), home);
                return home;
            }
        } catch (SftpException e) {
            guardPermission(e, "~");
            log.error("[{}] ❌ Failed to determine home directory: {}", session.getSessionId(), e.getMessage(), e);
            throw new BrowseException("Failed to determine home directory: " + e.getMessage(), e);
        }
    }

    // FileTransferable

    @Override
    public void upload(String remotePath, InputStream source, long fileSize, TransferProgressCallback callback)
            throws TransferException {
        assertActive();
        log.info("[{}] ⬆️  Upload starting → '{}' ({} bytes)", session.getSessionId(), remotePath, fileSize);

        // Opend a *dedicated* ChannelSftp for this upload — same reasoning as download().
        // sftpChannel.put() is a long-running blocking call; holding channelLock for its
        // entire duration would block every concurrent metadata operation (list, rename, etc.)
        // for the whole transfer time. A dedicated channel avoids both the contention and the
        // risk of concurrent put() calls interfering with each other's internal state.
        ChannelSftp uploadChannel = null;
        try {
            uploadChannel = (ChannelSftp) jschSession.openChannel("sftp");
            uploadChannel.connect(props.getChannelTimeoutMs());
            uploadChannel.put(source, remotePath, new JschSftpProgressMonitor(callback), ChannelSftp.OVERWRITE);
            log.info("[{}] ✓ Upload complete → '{}'", session.getSessionId(), remotePath);
        } catch (SftpException e) {
            guardPermission(e, remotePath);
            log.error("[{}] ❌ Upload failed → '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Upload to '" + remotePath + "' failed: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("[{}] ❌ Upload failed → '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
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

            log.info("[{}] ✓ Download stream opened ← '{}'", session.getSessionId(), remotePath);
            return new ChannelClosingInputStream(tracked, downloadChannel);

        } catch (SftpException e) {
            disconnectQuietly(downloadChannel);
            guardPermission(e, remotePath);
            log.error("[{}] ❌ Download failed ← '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Download from '" + remotePath + "' failed: " + e.getMessage(), e);
        } catch (Exception e) {
            disconnectQuietly(downloadChannel);
            log.error("[{}] ❌ Download failed ← '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
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

        return RemoteFile.builder()
                .name(name)
                .path(fullPath)
                .type(type)
                .sizeBytes(attrs.getSize())
                .lastModified(lastModified)
                .permissions(permissions)
                .owner(String.valueOf(attrs.getUId()))
                .hidden(name.startsWith("."))
                .build();
    }

    /**
     * Wraps an {@link InputStream} and fires {@link TransferProgressCallback#onProgress} as bytes
     * are read, reporting cumulative bytes transferred.
     *
     * <p>Used in place of {@link com.jcraft.jsch.SftpProgressMonitor} for downloads to avoid the
     * internal {@code _stat()} call that {@code ChannelSftp.get(path, monitor)} issues when a
     * non-null monitor is provided. That stat call triggers an
     * {@link IndexOutOfBoundsException} in certain mwiede/jsch + OpenSSH server combinations.
     *
     * <p>Total bytes are reported as {@code -1} because the file size is unknown without {@code _stat}.
     * The service layer already initialises download transfers with {@code totalBytes = -1}.
     */
    private static final class ProgressTrackingInputStream extends FilterInputStream {

        private final TransferProgressCallback callback;
        private long transferred = 0L;

        ProgressTrackingInputStream(InputStream in, TransferProgressCallback callback) {
            super(in);
            this.callback = callback;
        }

        @Override
        public int read() throws IOException {
            int b = super.read();
            if (b != -1) {
                callback.onProgress(++transferred, -1L);
            }
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            int n = super.read(b, off, len);
            if (n > 0) {
                transferred += n;
                callback.onProgress(transferred, -1L);
            }
            return n;
        }
    }

    /**
     * Supplies a known password to JSch for both the {@code password} and
     * {@code keyboard-interactive} SSH auth methods.
     *
     * <p>Many Linux servers (Ubuntu/Debian with {@code UsePAM yes}) disable the raw
     * {@code password} method and only accept {@code keyboard-interactive} (PAM).
     * OpenSSH's CLI client handles this transparently; JSch requires an explicit
     * {@link UserInfo} + {@link UIKeyboardInteractive} implementation to do the same.
     */
    private record PasswordUserInfo(String password) implements UserInfo, UIKeyboardInteractive {

        @Override
        public String[] promptKeyboardInteractive(
                String destination, String name, String instruction, String[] prompt, boolean[] echo) {
            // The server may send multiple prompts (e.g. OTP after password).
            // Fill every slot with the password — for plain PAM there is always exactly one prompt.
            String[] responses = new String[prompt.length];
            Arrays.fill(responses, password);
            return responses;
        }

        @Override
        public String getPassword() {
            return password;
        }

        @Override
        public boolean promptPassword(String message) {
            return true;
        }

        @Override
        public String getPassphrase() {
            return null;
        }

        @Override
        public boolean promptPassphrase(String message) {
            return false;
        }

        @Override
        public boolean promptYesNo(String message) {
            return false;
        }

        @Override
        public void showMessage(String message) {}
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
        public void add(HostKey hostkey, UserInfo ui) {}

        @Override
        public void remove(String host, String type) {}

        @Override
        public void remove(String host, String type, byte[] key) {}

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

    /**
     * Wraps an {@link InputStream} and disconnects the dedicated download {@link ChannelSftp}
     * when the stream is closed.
     *
     * <p>Stacked on top of {@link ProgressTrackingInputStream}:
     * {@code close()} → closes the tracked stream → closes the raw JSch stream → then
     * disconnects the dedicated channel. This ensures the channel is released whether the
     * download completes normally, is cancelled, or fails mid-transfer.
     */
    private static final class ChannelClosingInputStream extends FilterInputStream {

        private final ChannelSftp channel;

        ChannelClosingInputStream(InputStream in, ChannelSftp channel) {
            super(in);
            this.channel = channel;
        }

        @Override
        public void close() throws IOException {
            try {
                super.close();
            } finally {
                disconnectQuietly(channel);
            }
        }
    }
}
