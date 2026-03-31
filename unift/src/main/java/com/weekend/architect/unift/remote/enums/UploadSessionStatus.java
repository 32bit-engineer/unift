package com.weekend.architect.unift.remote.enums;

/** Lifecycle status of a resumable chunked-upload session. */
public enum UploadSessionStatus {
    /** Session created; no chunks acknowledged yet. */
    PENDING,

    /** At least one chunk acknowledged but not all chunks received. */
    IN_PROGRESS,

    /** All chunks acknowledged — upload is complete. */
    COMPLETED,

    /** Upload failed; session is no longer usable. */
    FAILED,

    /** Session TTL elapsed before all chunks were received. */
    EXPIRED
}
