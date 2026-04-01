package com.weekend.architect.unift.remote.analytics;

import com.weekend.architect.unift.remote.analytics.dto.AnalyticsHistoryResponse;
import com.weekend.architect.unift.remote.analytics.dto.SessionAnalyticsResponse;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Contract for assembling a full analytics snapshot for one active session. */
public interface SessionAnalyticsService {

    /**
     * Collects and returns a full analytics snapshot for the given session.
     *
     * <p>Expensive probes (SSH latency, packet loss, system metrics, CPU per node) are executed in
     * parallel on virtual threads and time-bounded so that the overall call completes within a few
     * seconds even when some probes fail. The snapshot is automatically persisted to the database
     * after assembly.
     *
     * @param sessionId the session to inspect
     * @param requestingUserId the authenticated user's UUID (ownership check)
     * @return a fully-assembled analytics response
     * @throws com.weekend.architect.unift.remote.exception.SessionNotFoundException if session does
     *     not exist
     * @throws com.weekend.architect.unift.remote.exception.SessionAccessDeniedException if the
     *     caller does not own the session
     */
    SessionAnalyticsResponse getAnalytics(String sessionId, UUID requestingUserId);

    /**
     * Returns historical analytics snapshots stored for the given session, newest-first. Ownership
     * is enforced at the DB level — a user can only query their own sessions even if the session is
     * no longer live.
     *
     * @param sessionId the session whose history to retrieve
     * @param requestingUserId the authenticated user's UUID
     * @param from optional inclusive lower bound on snapshot timestamp
     * @param to optional inclusive upper bound on snapshot timestamp
     * @param limit max entries to return (server-side cap: 500)
     * @return paginated history response
     */
    AnalyticsHistoryResponse getAnalyticsHistory(
            String sessionId, UUID requestingUserId, OffsetDateTime from, OffsetDateTime to, int limit);
}
