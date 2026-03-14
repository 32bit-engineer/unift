package com.weekend.architect.unift.auth.repository;

import com.weekend.architect.unift.auth.model.User;
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
public class UserRepository {

    private static final String USERNAME = "username";
    private static final String EMAIL = "email";

    private final NamedParameterJdbcTemplate jdbc;

    private User mapRow(ResultSet rs, int rowNum) throws SQLException {
        return User.builder()
                .id(rs.getObject("id", UUID.class))
                .firstName(rs.getString("first_name"))
                .lastName(rs.getString("last_name"))
                .username(rs.getString(USERNAME))
                .password(rs.getString("password"))
                .role(rs.getString("role"))
                .email(rs.getString(EMAIL))
                .phoneNumber(rs.getString("phone_number"))
                .emailVerified(rs.getBoolean("email_verified"))
                .emailVerifiedAt(toOffsetDateTime(rs.getTimestamp("email_verified_at")))
                .active(rs.getBoolean("is_active"))
                .createdAt(toOffsetDateTime(rs.getTimestamp("created_at")))
                .lastLoginAt(toOffsetDateTime(rs.getTimestamp("last_login_at")))
                .passwordUpdatedAt(toOffsetDateTime(rs.getTimestamp("password_updated_at")))
                .failedLoginAttempts(rs.getInt("failed_login_attempts"))
                .lockedUntil(toOffsetDateTime(rs.getTimestamp("locked_until")))
                .deletedAt(toOffsetDateTime(rs.getTimestamp("deleted_at")))
                .build();
    }

    private OffsetDateTime toOffsetDateTime(Timestamp ts) {
        return ts == null ? null : ts.toInstant().atOffset(ZoneOffset.UTC);
    }

    public Optional<User> findById(UUID id) {
        String sql = "SELECT * FROM users WHERE id = :id";
        List<User> results = jdbc.query(sql, new MapSqlParameterSource("id", id), this::mapRow);
        return results.stream().findFirst();
    }

    public Optional<User> findByUsername(String username) {
        String sql = "SELECT * FROM users WHERE username = :username AND deleted_at IS NULL";
        List<User> results = jdbc.query(sql, new MapSqlParameterSource(USERNAME, username), this::mapRow);
        return results.stream().findFirst();
    }

    public Optional<User> findByEmail(String email) {
        String sql = "SELECT * FROM users WHERE email = :email AND deleted_at IS NULL";
        List<User> results = jdbc.query(sql, new MapSqlParameterSource(EMAIL, email), this::mapRow);
        return results.stream().findFirst();
    }

    /**
     * Find by username or email — used at login time when caller may provide either.
     */
    public Optional<User> findByUsernameOrEmail(String usernameOrEmail) {
        String sql =
                """
                SELECT * FROM users
                WHERE (username = :val OR email = :val)
                  AND deleted_at IS NULL
                LIMIT 1
                """;
        List<User> results = jdbc.query(sql, new MapSqlParameterSource("val", usernameOrEmail), this::mapRow);
        return results.stream().findFirst();
    }

    public boolean existsByUsername(String username) {
        String sql = "SELECT COUNT(1) FROM users WHERE username = :username";
        Integer count = jdbc.queryForObject(sql, new MapSqlParameterSource(USERNAME, username), Integer.class);
        return count != null && count > 0;
    }

    public boolean existsByEmail(String email) {
        String sql = "SELECT COUNT(1) FROM users WHERE email = :email";
        Integer count = jdbc.queryForObject(sql, new MapSqlParameterSource(EMAIL, email), Integer.class);
        return count != null && count > 0;
    }

    // -------------------------------------------------------------------------
    // Mutations
    // -------------------------------------------------------------------------

    public void save(User user) {
        String sql =
                """
                INSERT INTO users (
                    id, username, password, role,
                    first_name, last_name, email, phone_number,
                    is_active, created_at
                ) VALUES (
                    :id, :username, :password, :role,
                    :firstName, :lastName, :email, :phoneNumber,
                    true, NOW()
                )
                """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("id", user.getId())
                .addValue(USERNAME, user.getUsername())
                .addValue("password", user.getPassword())
                .addValue("role", user.getRole())
                .addValue("firstName", user.getFirstName())
                .addValue("lastName", user.getLastName())
                .addValue(EMAIL, user.getEmail())
                .addValue("phoneNumber", user.getPhoneNumber());

        jdbc.update(sql, params);
    }

    public void updateLastLogin(UUID userId) {
        String sql = "UPDATE users SET last_login_at = NOW() WHERE id = :id";
        jdbc.update(sql, new MapSqlParameterSource("id", userId));
    }

    public void incrementFailedLoginAttempts(UUID userId) {
        String sql = "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = :id";
        jdbc.update(sql, new MapSqlParameterSource("id", userId));
    }

    public void lockAccount(UUID userId, OffsetDateTime lockedUntil) {
        String sql = "UPDATE users SET locked_until = :lockedUntil WHERE id = :id";
        MapSqlParameterSource params =
                new MapSqlParameterSource().addValue("id", userId).addValue("lockedUntil", lockedUntil);
        jdbc.update(sql, params);
    }

    public void resetLoginState(UUID userId) {
        String sql =
                """
                UPDATE users
                SET failed_login_attempts = 0,
                    locked_until = NULL
                WHERE id = :id
                """;
        jdbc.update(sql, new MapSqlParameterSource("id", userId));
    }
}
