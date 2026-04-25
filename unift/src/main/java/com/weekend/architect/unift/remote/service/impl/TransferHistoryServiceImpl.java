package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
import com.weekend.architect.unift.remote.dto.TransferLogPageResponse;
import com.weekend.architect.unift.remote.dto.TransferLogResponse;
import com.weekend.architect.unift.remote.model.TransferLog;
import com.weekend.architect.unift.remote.repository.TransferLogRepository;
import com.weekend.architect.unift.remote.service.TransferHistoryService;
import com.weekend.architect.unift.remote.StreamConstants;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Slf4j
@Service
public class TransferHistoryServiceImpl implements TransferHistoryService {

    private final TransferLogRepository repository;
    private final ExecutorService virtualThreadExecutor;

    public TransferHistoryServiceImpl(
            TransferLogRepository repository,
            @Qualifier("virtualThreadExecutor") ExecutorService virtualThreadExecutor) {
        this.repository = repository;
        this.virtualThreadExecutor = virtualThreadExecutor;
    }

    @Override
    public TransferLogPageResponse listHistory(
            UUID userId, int page, int size, String sessionId, String username, String status) {
        List<TransferLogResponse> items =
                repository.findByUserIdWithFilters(userId, page, size, sessionId, username, status).stream()
                        .map(this::toResponse)
                        .toList();
        long total = repository.countByUserIdWithFilters(userId, sessionId, username, status);
        int safeSize = Math.min(size, 100);
        return TransferLogPageResponse.builder()
                .page(page)
                .size(safeSize)
                .total(total)
                .hasMore((long) (page + 1) * safeSize < total)
                .items(items)
                .build();
    }

    @Override
    public TransferLogResponse getEntry(UUID id, UUID userId) {
        return repository
                .findById(id, userId)
                .map(this::toResponse)
                .orElseThrow(() -> new IllegalArgumentException("Transfer log entry not found: " + id));
    }

    @Override
    public TransferHistoryStatsResponse getStats(UUID userId) {
        return repository.getStats(userId);
    }

    @Override
    public void deleteEntry(UUID id, UUID userId) {
        boolean deleted = repository.deleteById(id, userId);
        if (!deleted) {
            throw new IllegalArgumentException("Transfer log entry not found: " + id);
        }
        log.info("[transfer-history] Entry {} deleted by user {}", id, userId);
    }

    @Override
    public SseEmitter streamStats(UUID userId, int intervalMs) {
        int clamped = Math.max(
                StreamConstants.MIN_STREAM_INTERVAL_MS,
                Math.min(StreamConstants.MAX_STREAM_INTERVAL_MS, intervalMs));

        SseEmitter emitter = new SseEmitter(StreamConstants.STREAM_TIMEOUT_MS);
        AtomicBoolean open = new AtomicBoolean(true);
        emitter.onCompletion(() -> open.set(false));
        emitter.onError(_ -> open.set(false));
        emitter.onTimeout(() -> {
            open.set(false);
            emitter.complete();
        });

        virtualThreadExecutor.submit(() -> {
            while (open.get()) {
                try {
                    TransferHistoryStatsResponse payload = getStats(userId);
                    emitter.send(SseEmitter.event().name("stats").data(payload));
                    Thread.sleep(clamped);
                } catch (InterruptedException _) {
                    Thread.currentThread().interrupt();
                    open.set(false);
                    emitter.complete();
                    return;
                } catch (IOException | IllegalStateException _) {
                    open.set(false);
                    return;
                } catch (Exception ex) {
                    try {
                        emitter.send(SseEmitter.event()
                                .name("error")
                                .data(Map.of(
                                        "message",
                                        ex.getMessage() != null ? ex.getMessage() : "Transfer stats stream failed")));
                    } catch (IOException | IllegalStateException _) {
                        // ignore nested emitter failures while unwinding stream
                    }
                    open.set(false);
                    emitter.complete();
                    return;
                }
            }
        });

        return emitter;
    }

    private TransferLogResponse toResponse(TransferLog t) {
        return TransferLogResponse.builder()
                .id(t.getId())
                .sessionId(t.getSessionId())
                .username(t.getUsername())
                .filename(t.getFilename())
                .source(t.getSource())
                .destination(t.getDestination())
                .sizeBytes(t.getSizeBytes())
                .avgSpeedBps(t.getAvgSpeedBps())
                .durationMs(t.getDurationMs())
                .status(t.getStatus())
                .errorMessage(t.getErrorMessage())
                .createdAt(t.getCreatedAt())
                .build();
    }
}
