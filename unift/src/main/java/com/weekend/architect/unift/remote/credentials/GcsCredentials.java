package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** Placeholder – Google Cloud Storage support is not yet implemented. */
@Getter
public final class GcsCredentials extends RemoteCredentials {

    private final String serviceAccountKeyJson;
    private final String bucketName;

    @Builder
    public GcsCredentials(String host, int port, String serviceAccountKeyJson, String bucketName) {
        super(host, port, ProtocolType.GCS);
        this.serviceAccountKeyJson = serviceAccountKeyJson;
        this.bucketName = bucketName;
    }
}
