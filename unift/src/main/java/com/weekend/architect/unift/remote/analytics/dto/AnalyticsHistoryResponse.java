package com.weekend.architect.unift.remote.analytics.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import lombok.Builder;
import lombok.Value;

/** Paginated list of historical analytics snapshots for one session. */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AnalyticsHistoryResponse {

    String sessionId;

    /** Total number of snapshots returned (≤ requested limit). */
    int count;

    /**
     * Whether more rows exist beyond the current page. Use the {@code before} query parameter with
     * the {@code capturedAt} of the oldest entry to fetch the next page.
     */
    boolean hasMore;

    /** Snapshots ordered newest-first. Each entry is a full analytics response. */
    List<SessionAnalyticsResponse> snapshots;
}
