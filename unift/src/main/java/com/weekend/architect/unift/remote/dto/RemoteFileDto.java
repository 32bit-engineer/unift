package com.weekend.architect.unift.remote.dto;

import com.weekend.architect.unift.remote.enums.FileType;
import java.time.OffsetDateTime;
import lombok.Builder;
import lombok.Value;

/** A single remote file-system entry in a directory listing response. */
@Value
@Builder
public class RemoteFileDto {

    String name;
    String path;
    FileType type;
    long sizeBytes;
    OffsetDateTime lastModified;
    String permissions;
    String owner;
    boolean hidden;
}
