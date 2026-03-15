package com.weekend.architect.unift.remote.dto;

import java.util.List;
import lombok.Builder;
import lombok.Value;

/** Response for a directory listing request. */
@Value
@Builder
public class DirectoryListingResponse {

    /** The path that was listed. */
    String path;

    /** All entries at the path (files, directories, symlinks). */
    List<RemoteFileDto> entries;

    /** Total number of entries (including hidden). */
    int totalEntries;
}
