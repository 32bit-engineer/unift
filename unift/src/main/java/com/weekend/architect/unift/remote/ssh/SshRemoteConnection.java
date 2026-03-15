package com.weekend.architect.unift.remote.ssh;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
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
import com.weekend.architect.unift.remote.exception.TransferException;
import com.weekend.architect.unift.remote.model.RemoteFile;
import com.weekend.architect.unift.remote.model.RemoteSession;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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

        // TODO: replace "no" with a configurable known-hosts file for production use
        jschSession.setConfig("StrictHostKeyChecking", "no");
        jschSession.setConfig("PreferredAuthentications", "publickey, password");

        log.info(
                "[{}] 🔌 Connecting to SSH server: {}@{}:{}",
                session.getSessionId(),
                username,
                credentials.getHost(),
                credentials.getPort());
        try {
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
        try {
            synchronized (channelLock) {
                sftpChannel.put(source, remotePath, new JschSftpProgressMonitor(callback), ChannelSftp.OVERWRITE);
            }
            log.info("[{}] ✓ Upload complete → '{}'", session.getSessionId(), remotePath);
        } catch (SftpException e) {
            log.error("[{}] ❌ Upload failed → '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Upload to '" + remotePath + "' failed: " + e.getMessage(), e);
        }
    }

    @Override
    public InputStream download(String remotePath, TransferProgressCallback callback) throws TransferException {
        assertActive();
        log.info("[{}] ⬇️  Download starting ← '{}'", session.getSessionId(), remotePath);
        try {
            // JSch returns an InputStream backed by the SFTP channel;
            // the caller MUST close it to release the channel slot.
            synchronized (channelLock) {
                InputStream stream = sftpChannel.get(remotePath, new JschSftpProgressMonitor(callback));
                log.info("[{}] ✓ Download stream opened ← '{}'", session.getSessionId(), remotePath);
                return stream;
            }
        } catch (SftpException e) {
            log.error("[{}] ❌ Download failed ← '{}': {}", session.getSessionId(), remotePath, e.getMessage(), e);
            throw new TransferException("Download from '" + remotePath + "' failed: " + e.getMessage(), e);
        }
    }

    // Mapping helpers

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
}
