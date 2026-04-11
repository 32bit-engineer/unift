package com.weekend.architect.unift.remote.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import lombok.Builder;
import lombok.Value;

/**
 * Paginated wrapper for transfer history list responses.
 *
 * <p>Carries the current page of {@link TransferLogResponse} items together with
 * enough metadata for the client to implement pagination controls.
 */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TransferLogPageResponse {

    /** 0-based page index that was returned. */
    int page;

    /** Number of items requested per page. */
    int size;

    /** Total number of entries matching the current filters (for page-count calculation). */
    long total;

    /** Whether another page exists after this one. */
    boolean hasMore;

    List<TransferLogResponse> items;
}
