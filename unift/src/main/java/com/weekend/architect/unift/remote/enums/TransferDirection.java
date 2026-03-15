package com.weekend.architect.unift.remote.enums;

/** Direction of a file transfer from the perspective of the UniFT server. */
public enum TransferDirection {
    /** Client → remote host. */
    UPLOAD,

    /** Remote host → client (streamed through UniFT). */
    DOWNLOAD
}
