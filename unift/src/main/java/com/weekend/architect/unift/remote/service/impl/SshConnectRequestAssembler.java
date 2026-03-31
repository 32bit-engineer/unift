package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.dto.ConnectRequest;
import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.model.SavedHost;
import com.weekend.architect.unift.remote.service.ConnectRequestAssembler;
import org.springframework.stereotype.Component;

/**
 * Assembles a {@link ConnectRequest} for SSH / SFTP connections.
 *
 * <p>Maps the persisted {@link SavedHost} fields and the on-the-fly decrypted
 * SSH credentials (password, private key, passphrase) into a fully-populated
 * {@link ConnectRequest} ready for the connection service.
 *
 * <p>Only handles {@link ProtocolType#SSH_SFTP}; other protocols must provide
 * their own {@link ConnectRequestAssembler} implementation.
 */
@Component
public class SshConnectRequestAssembler implements ConnectRequestAssembler {

    @Override
    public boolean supports(ProtocolType protocol) {
        return protocol == ProtocolType.SSH_SFTP;
    }

    @Override
    public ConnectRequest assemble(
            SavedHost host, String decryptedPassword, String decryptedPrivateKey, String decryptedPassphrase) {
        return ConnectRequest.builder()
                .protocol(ProtocolType.SSH_SFTP)
                .label(host.getLabel())
                .host(host.getHostname())
                .port(host.getPort())
                .username(host.getUsername())
                .sshAuthType(host.getAuthType())
                .password(decryptedPassword)
                .privateKey(decryptedPrivateKey)
                .passphrase(decryptedPassphrase)
                .strictHostKeyChecking(host.isStrictHostKeyChecking())
                .expectedFingerprint(host.getExpectedFingerprint())
                .savedHostId(host.getId())
                .build();
    }
}
