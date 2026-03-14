package com.weekend.architect.unift.auth.model;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {
    private UUID id;
    private String firstName;
    private String lastName;
    private String username;
    private String password;
    private String role;
    private String email;
    private String phoneNumber;
    private boolean emailVerified;
    private OffsetDateTime emailVerifiedAt;
    private boolean active;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastLoginAt;
    private OffsetDateTime passwordUpdatedAt;
    private int failedLoginAttempts;
    private OffsetDateTime lockedUntil;
    private OffsetDateTime deletedAt;
}
