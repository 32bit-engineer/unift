package com.weekend.architect.unift.remote.credentials;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import lombok.Builder;
import lombok.Getter;

/** Placeholder – Azure Blob Storage support is not yet implemented. */
@Getter
public final class AzureBlobCredentials extends RemoteCredentials {

    private final String connectionString;
    private final String containerName;

    @Builder
    public AzureBlobCredentials(String host, int port, String connectionString, String containerName) {
        super(host, port, ProtocolType.AZURE_BLOB);
        this.connectionString = connectionString;
        this.containerName = containerName;
    }
}
