package com.weekend.architect.unift.auth.repository;

import com.weekend.architect.unift.auth.model.RefreshToken;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RefreshTokenRepository {

    private final NamedParameterJdbcTemplate jdbc;

    // -------------------------------------------------------------------------
    // Row mapper
    // -------------------------------------------------------------------------

    private RefreshToken mapRow(ResultSet rs, int rowNum) throws SQLException {
        return RefreshToken.builder()
                .id(rs.getObject("id", UUID.class))
                .userId(rs.getObject("user_id", UUID.class))
                .tokenHash(rs.getString("token_hash"))
                .deviceHint(rs.getString("device_hint"))
                .issuedAt(toOffsetDateTime(rs.getTimestamp("issued_at")))
                .expiresAt(toOffsetDateTime(rs.getTimestamp("expires_at")))
                .revokedAt(toOffsetDateTime(rs.getTimestamp("revoked_at")))
                .build();
    }

    private OffsetDateTime toOffsetDateTime(Timestamp ts) {
        return ts == null ? null : ts.toInstant().atOffset(ZoneOffset.UTC);
    }

    // -------------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------------

    public Optional<RefreshToken> findByTokenHash(String tokenHash) {
        String sql = "SELECT * FROM refresh_tokens WHERE token_hash = :tokenHash";
        List<RefreshToken> results = jdbc.query(sql, new MapSqlParameterSource("tokenHash", tokenHash), this::mapRow);
        return results.stream().findFirst();
    }

    // -------------------------------------------------------------------------
    // Mutations
    // -------------------------------------------------------------------------

    public void save(RefreshToken token) {
        String sql =
                """
                INSERT INTO refresh_tokens (id, user_id, token_hash, device_hint, issued_at, expires_at)
                VALUES (:id, :userId, :tokenHash, :deviceHint, :issuedAt, :expiresAt)
                """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("id", token.getId())
                .addValue("userId", token.getUserId())
                .addValue("tokenHash", token.getTokenHash())
                .addValue("deviceHint", token.getDeviceHint())
                .addValue("issuedAt", token.getIssuedAt())
                .addValue("expiresAt", token.getExpiresAt());

        jdbc.update(sql, params);
    }

    public void revokeByTokenHash(String tokenHash) {
        String sql = "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = :tokenHash";
        jdbc.update(sql, new MapSqlParameterSource("tokenHash", tokenHash));
    }

    public void revokeAllByUserId(UUID userId) {
        String sql =
                """
                UPDATE refresh_tokens
                SET revoked_at = NOW()
                WHERE user_id = :userId AND revoked_at IS NULL
                """;
        jdbc.update(sql, new MapSqlParameterSource("userId", userId));
    }
}
