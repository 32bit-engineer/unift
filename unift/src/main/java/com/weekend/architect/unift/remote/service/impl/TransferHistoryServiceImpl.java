package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
import com.weekend.architect.unift.remote.dto.TransferLogPageResponse;
import com.weekend.architect.unift.remote.dto.TransferLogResponse;
import com.weekend.architect.unift.remote.model.TransferLog;
import com.weekend.architect.unift.remote.repository.TransferLogRepository;
import com.weekend.architect.unift.remote.service.TransferHistoryService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class TransferHistoryServiceImpl implements TransferHistoryService {

    private final TransferLogRepository repository;

    @Override
    public TransferLogPageResponse listHistory(
            UUID userId, int page, int size, String sessionId, String username, String status) {
        List<TransferLogResponse> items = repository
                .findByUserIdWithFilters(userId, page, size, sessionId, username, status)
                .stream()
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
