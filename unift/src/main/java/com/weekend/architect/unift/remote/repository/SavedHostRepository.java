package com.weekend.architect.unift.remote.repository;

import com.weekend.architect.unift.remote.enums.ProtocolType;
import com.weekend.architect.unift.remote.enums.SshAuthType;
import com.weekend.architect.unift.remote.model.SavedHost;
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
public class SavedHostRepository {

    private static final String PARAM_ID = "id";
    private static final String PARAM_USER_ID = "userId";

    private final NamedParameterJdbcTemplate jdbc;

    private SavedHost mapRow(ResultSet rs, int rowNum) throws SQLException {
        String rawAuthType = rs.getString("auth_type");
        String rawProtocol = rs.getString("protocol_type");
        return SavedHost.builder()
                .id(rs.getObject("id", UUID.class))
                .userId(rs.getObject("user_id", UUID.class))
                .label(rs.getString("label"))
                // Fall back to SSH_SFTP for rows written before the protocol_type column was added
                .protocol(rawProtocol != null ? toProtocolType(rawProtocol) : ProtocolType.SSH_SFTP)
                .hostname(rs.getString("hostname"))
                .port(rs.getInt("port"))
                .username(rs.getString("username"))
                // auth_type is SSH-specific; may be null for non-SSH protocols
                .authType(rawAuthType != null ? toSshAuthType(rawAuthType) : null)
                .encryptedPassword(rs.getString("encrypted_password"))
                .encryptedPrivateKey(rs.getString("encrypted_privatekey"))
                .encryptedPassphrase(rs.getString("encrypted_passphrase"))
                .strictHostKeyChecking(rs.getBoolean("strict_host_key_checking"))
                .expectedFingerprint(rs.getString("expected_fingerprint"))
                .workspacePreference(rs.getString("workspace_preference"))
                .createdAt(toOffsetDateTime(rs.getTimestamp("created_at")))
                .lastUsed(toOffsetDateTime(rs.getTimestamp("last_used")))
                .build();
    }

    /**
     * Maps the Postgres {@code auth_type_enum} lowercase value to the Java {@link SshAuthType}.
     * DB values: {@code password}, {@code key}, {@code key_passphrase}.
     */
    private static SshAuthType toSshAuthType(String dbValue) {
        return switch (dbValue) {
            case "password" -> SshAuthType.PASSWORD;
            case "key" -> SshAuthType.PRIVATE_KEY;
            case "key_passphrase" -> SshAuthType.PRIVATE_KEY_PASSPHRASE;
            default -> throw new IllegalArgumentException("Unknown auth_type from DB: " + dbValue);
        };
    }

    /** Maps Java {@link SshAuthType} back to the Postgres {@code auth_type_enum} literal. */
    private static String toDbAuthType(SshAuthType authType) {
        return switch (authType) {
            case PASSWORD -> "password";
            case PRIVATE_KEY -> "key";
            case PRIVATE_KEY_PASSPHRASE -> "key_passphrase";
        };
    }

    /**
     * Maps the Postgres {@code protocol_type_enum} lowercase value to {@link ProtocolType}.
     * DB values: {@code ssh_sftp}, {@code ftp}, {@code s3}, {@code azure_blob}, {@code gcs}.
     */
    private static ProtocolType toProtocolType(String dbValue) {
        return switch (dbValue) {
            case "ssh_sftp" -> ProtocolType.SSH_SFTP;
            case "ftp" -> ProtocolType.FTP;
            case "s3" -> ProtocolType.S3;
            case "azure_blob" -> ProtocolType.AZURE_BLOB;
            case "gcs" -> ProtocolType.GCS;
            default -> throw new IllegalArgumentException("Unknown protocol_type from DB: " + dbValue);
        };
    }

    /** Maps Java {@link ProtocolType} back to the Postgres {@code protocol_type_enum} literal. */
    private static String toDbProtocolType(ProtocolType protocol) {
        return switch (protocol) {
            case SSH_SFTP -> "ssh_sftp";
            case FTP -> "ftp";
            case S3 -> "s3";
            case AZURE_BLOB -> "azure_blob";
            case GCS -> "gcs";
        };
    }

    private static OffsetDateTime toOffsetDateTime(Timestamp ts) {
        return ts == null ? null : ts.toInstant().atOffset(ZoneOffset.UTC);
    }

    public void save(SavedHost host) {
        String sql =
                """
                INSERT INTO saved_hosts (
                    id, user_id, label, protocol_type, hostname, port, username,
                    auth_type,
                    encrypted_password, encrypted_privatekey, encrypted_passphrase,
                    strict_host_key_checking, expected_fingerprint,
                    workspace_preference,
                    created_at
                ) VALUES (
                    :id, :userId, :label, :protocolType::protocol_type_enum, :hostname, :port, :username,
                    :authType::auth_type_enum,
                    :encryptedPassword, :encryptedPrivateKey, :encryptedPassphrase,
                    :strictHostKeyChecking, :expectedFingerprint,
                    :workspacePreference,
                    NOW()
                )
                """;
        jdbc.update(sql, buildParams(host));
    }

    public Optional<SavedHost> findById(UUID id) {
        String sql = "SELECT * FROM saved_hosts WHERE id = :id";
        return jdbc.query(sql, new MapSqlParameterSource(PARAM_ID, id), this::mapRow).stream()
                .findFirst();
    }

    /** Returns all saved hosts for a user, newest first. */
    public List<SavedHost> findByUserId(UUID userId) {
        String sql = "SELECT * FROM saved_hosts WHERE user_id = :userId ORDER BY created_at DESC";
        return jdbc.query(sql, new MapSqlParameterSource(PARAM_USER_ID, userId), this::mapRow);
    }

    /** Sets {@code last_used = NOW()} for the given row. Best-effort — callers may ignore failure. */
    public void touchLastUsed(UUID id) {
        String sql = "UPDATE saved_hosts SET last_used = NOW() WHERE id = :id";
        jdbc.update(sql, new MapSqlParameterSource(PARAM_ID, id));
    }

    /**
     * Updates the workspace preference for the given host (ownership enforced).
     *
     * @return {@code true} if a row was updated, {@code false} if not found / not owned
     */
    public boolean updateWorkspacePreference(UUID id, UUID userId, String preference) {
        String sql = "UPDATE saved_hosts SET workspace_preference = :pref WHERE id = :id AND user_id = :userId";
        int rows = jdbc.update(
                sql,
                new MapSqlParameterSource()
                        .addValue(PARAM_ID, id)
                        .addValue(PARAM_USER_ID, userId)
                        .addValue("pref", preference));
        return rows > 0;
    }

    /**
     * Deletes the host only when it also belongs to {@code userId} (ownership check in DB).
     *
     * @return {@code true} if a row was deleted, {@code false} if not found / not owned
     */
    public boolean deleteById(UUID id, UUID userId) {
        String sql = "DELETE FROM saved_hosts WHERE id = :id AND user_id = :userId";
        int rows = jdbc.update(
                sql, new MapSqlParameterSource().addValue(PARAM_ID, id).addValue(PARAM_USER_ID, userId));
        return rows > 0;
    }

    private static MapSqlParameterSource buildParams(SavedHost h) {
        return new MapSqlParameterSource()
                .addValue("id", h.getId())
                .addValue("userId", h.getUserId())
                .addValue("label", h.getLabel())
                .addValue("protocolType", toDbProtocolType(h.getProtocol()))
                .addValue("hostname", h.getHostname())
                .addValue("port", h.getPort())
                .addValue("username", h.getUsername())
                // authType is SSH-specific; null for other protocols
                .addValue("authType", h.getAuthType() != null ? toDbAuthType(h.getAuthType()) : null)
                .addValue("encryptedPassword", h.getEncryptedPassword())
                .addValue("encryptedPrivateKey", h.getEncryptedPrivateKey())
                .addValue("encryptedPassphrase", h.getEncryptedPassphrase())
                .addValue("strictHostKeyChecking", h.isStrictHostKeyChecking())
                .addValue("expectedFingerprint", h.getExpectedFingerprint())
                .addValue("workspacePreference", h.getWorkspacePreference());
    }
}
