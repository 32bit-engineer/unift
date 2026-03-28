package com.weekend.architect.unift.remote.service.impl;

import com.weekend.architect.unift.remote.dto.TransferHistoryStatsResponse;
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
    public List<TransferLogResponse> listHistory(UUID userId, int page, int size) {
        return repository.findByUserId(userId, page, size).stream()
                .map(this::toResponse)
                .toList();
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
