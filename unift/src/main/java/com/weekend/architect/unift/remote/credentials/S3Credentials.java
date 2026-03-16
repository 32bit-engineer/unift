package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** Placeholder – Amazon S3 support is not yet implemented. */
@Getter
public final class S3Credentials extends RemoteCredentials {

    private final String accessKeyId;
    private final String secretAccessKey;
    private final String region;
    private final String bucket;

    @Builder
    public S3Credentials(
            String host,
            int port,
            String accessKeyId,
            String secretAccessKey,
            String region,
            String bucket,
            boolean strictHostKeyChecking,
            String expectedFingerprint) {
        super(host, port, ProtocolType.S3, strictHostKeyChecking, expectedFingerprint);
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.region = region;
        this.bucket = bucket;
    }
}
