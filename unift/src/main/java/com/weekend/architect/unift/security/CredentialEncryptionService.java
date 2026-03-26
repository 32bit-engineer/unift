package com.weekend.architect.unift.security;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * AES-256-GCM encryption / decryption for sensitive credential fields stored in the DB.
 *
 * <p><b>Storage format:</b> {@code <base64-IV>.<base64-ciphertext+auth-tag>}
 * A fresh 12-byte (96-bit) IV is generated per {@link #encrypt} call, so two identical
 * plaintexts always produce different ciphertexts (IND-CPA security).
 *
 * <p>The 128-bit GCM authentication tag guarantees both confidentiality and integrity —
 * any tampering with the stored blob causes a hard failure at decrypt time.
 *
 * <p><b>Key setup:</b> set {@code UNIFT_ENCRYPTION_KEY} to a Base64-encoded 32-byte secret.
 * Generate one with: {@code openssl rand -base64 32}
 */
@Slf4j
@Service
public class CredentialEncryptionService {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12; // 96-bit IV — NIST recommended for GCM
    private static final int TAG_BITS = 128; // maximum GCM auth-tag length

    private final SecretKey secretKey;
    private final SecureRandom rng = new SecureRandom();

    public CredentialEncryptionService(@Value("${unift.encryption.key}") String base64Key) {
        byte[] raw = Base64.getDecoder().decode(base64Key);
        if (raw.length != 32) {
            throw new IllegalStateException("unift.encryption.key must be Base64 of exactly 32 bytes (256 bits); got "
                    + raw.length + " bytes. " + "Generate one with: openssl rand -base64 32");
        }
        this.secretKey = new SecretKeySpec(raw, "AES");
        log.info("CredentialEncryptionService initialised (AES-256-GCM)");
    }

    /**
     * Encrypts {@code plaintext} and returns a self-contained string safe to persist in the DB.
     * Returns {@code null} when {@code plaintext} is {@code null}.
     *
     * <p>Format: {@code <base64-IV>.<base64-ciphertext+tag>}
     */
    public String encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_BYTES];
            rng.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv));

            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            return Base64.getEncoder().encodeToString(iv)
                    + "."
                    + Base64.getEncoder().encodeToString(ciphertext);
        } catch (Exception e) {
            throw new IllegalStateException("Credential encryption failed", e);
        }
    }

    /**
     * Decrypts a value previously produced by {@link #encrypt(String)}.
     * Returns {@code null} when {@code ciphertext} is {@code null}.
     *
     * @throws IllegalStateException if the value has been tampered with or the key is wrong
     */
    public String decrypt(String ciphertext) {
        if (ciphertext == null) return null;
        try {
            int dot = ciphertext.indexOf('.');
            if (dot < 0) {
                throw new IllegalArgumentException("Invalid encrypted credential format — missing delimiter");
            }
            byte[] iv = Base64.getDecoder().decode(ciphertext.substring(0, dot));
            byte[] encoded = Base64.getDecoder().decode(ciphertext.substring(dot + 1));

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv));

            return new String(cipher.doFinal(encoded), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Credential decryption failed", e);
        }
    }
}
