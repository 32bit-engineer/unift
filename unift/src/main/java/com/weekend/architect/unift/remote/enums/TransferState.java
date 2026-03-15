package com.weekend.architect.unift.remote.enums;

/** Lifecycle state of a single file-transfer operation. */
public enum TransferState {
    PENDING,
    IN_PROGRESS,
    COMPLETED,
    FAILED,
    CANCELLED
}
