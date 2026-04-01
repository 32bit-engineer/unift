package com.weekend.architect.unift.remote.enums;

/**
 * Supported remote-connection protocols. The sealed credentials hierarchy is keyed on this enum so
 * that the {@code ConnectionFactory} can dispatch via a pattern-matching switch.
 */
public enum ProtocolType {
    /** SSH File Transfer Protocol – implemented via JSch. */
    SSH_SFTP,

    /** Classic FTP (plain-text) – reserved for future implementation. */
    FTP,

    /** Amazon S3 / compatible object storage – reserved for future implementation. */
    S3,

    /** Azure Blob Storage – reserved for future implementation. */
    AZURE_BLOB,

    /** Google Cloud Storage – reserved for future implementation. */
    GCS
}
