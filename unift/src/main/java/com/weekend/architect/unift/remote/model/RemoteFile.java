package com.weekend.architect.unift.remote.model;

import com.weekend.architect.unift.remote.enums.FileType;
import java.time.OffsetDateTime;
import lombok.Builder;
import lombok.Value;

/**
 * Immutable snapshot of a single remote file-system entry.
 * Returned by directory-listing operations.
 */
@Value
@Builder
public class RemoteFile {

    /** File or directory name (no path separator). */
    String name;

    /** Absolute path on the remote host. */
    String path;

    FileType type;

    /** Size in bytes; {@code 0} for directories. */
    long sizeBytes;

    /** Last-modified timestamp reported by the remote host. */
    OffsetDateTime lastModified;

    /**
     * POSIX permission string, e.g. {@code -rwxr-xr-x}.
     * May be {@code null} for non-POSIX stores (e.g., S3).
     */
    String permissions;

    /** Owner name or UID string; may be {@code null}. */
    String owner;

    /** Whether this entry is a hidden file (name starts with {@code .}). */
    boolean hidden;
}
