package com.weekend.architect.unift.integration.support;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.apache.sshd.common.file.virtualfs.VirtualFileSystemFactory;
import org.apache.sshd.server.SshServer;
import org.apache.sshd.server.keyprovider.SimpleGeneratorHostKeyProvider;
import org.apache.sshd.sftp.server.SftpSubsystemFactory;

/**
 * Thin wrapper around an Apache MINA SSHD server that exposes an in-process SFTP endpoint for
 * integration tests.
 *
 * <p>Usage:
 *
 * <pre>
 * MockSftpServer server = new MockSftpServer();
 * server.start();
 * // ... tests connect to localhost:server.getPort() as TEST_USER/TEST_PASS
 * server.close();
 * </pre>
 *
 * <p>A temp directory is used as the SFTP virtual root for the test user. No SSH exec command
 * factory is configured — exec requests (e.g. the application's best-effort home-directory /
 * OS-detection probes) are rejected by MINA and caught gracefully by the service layer, resulting
 * in {@code null} for {@code homeDirectory} and {@code remoteOs}, which is acceptable in tests.
 */
public class MockSftpServer implements AutoCloseable {

    public static final String TEST_USER = "sftp-user";
    public static final String TEST_PASS = "sftp-pass";

    private final SshServer sshServer;
    private final Path rootDir;

    public MockSftpServer() throws Exception {
        this.rootDir = Files.createTempDirectory("unift-sftp-test-");
        this.sshServer = SshServer.setUpDefaultServer();

        sshServer.setHost("localhost");
        sshServer.setPort(0); // bind to any available port

        sshServer.setKeyPairProvider(new SimpleGeneratorHostKeyProvider());
        sshServer.setPasswordAuthenticator(
                (username, password, session) -> TEST_USER.equals(username) && TEST_PASS.equals(password));

        sshServer.setSubsystemFactories(List.of(new SftpSubsystemFactory()));

        VirtualFileSystemFactory fsFactory = new VirtualFileSystemFactory();
        fsFactory.setUserHomeDir(TEST_USER, rootDir.toAbsolutePath());
        sshServer.setFileSystemFactory(fsFactory);
    }

    public void start() throws IOException {
        sshServer.start();
    }

    /** Returns the actual bound port (only valid after {@link #start()}). */
    public int getPort() {
        return sshServer.getPort();
    }

    public String getHost() {
        return "localhost";
    }

    /** The directory that acts as the SFTP virtual root for the test user. */
    public Path getRootDir() {
        return rootDir;
    }

    /**
     * Creates a file in the SFTP root with the given name and UTF-8 content. Returns the absolute
     * host-side path (for assertions).
     */
    public Path createTestFile(String name, String content) throws IOException {
        Path file = rootDir.resolve(name);
        Files.writeString(file, content, StandardCharsets.UTF_8);
        return file;
    }

    @Override
    public void close() throws Exception {
        try {
            sshServer.stop();
        } finally {
            deleteRecursively(rootDir);
        }
    }

    private void deleteRecursively(Path dir) {
        try (var stream = Files.walk(dir)) {
            stream.sorted(java.util.Comparator.reverseOrder()).map(Path::toFile).forEach(java.io.File::delete);
        } catch (IOException ignored) {
        }
    }
}
