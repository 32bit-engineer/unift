package com.weekend.architect.unift.remote.enums;

/** SSH-specific authentication strategies. */
public enum SshAuthType {
    /** Plain username + password. */
    PASSWORD,

    /** PEM-encoded private key (no passphrase). */
    PRIVATE_KEY,

    /** PEM-encoded private key protected by a passphrase. */
    PRIVATE_KEY_PASSPHRASE
}
