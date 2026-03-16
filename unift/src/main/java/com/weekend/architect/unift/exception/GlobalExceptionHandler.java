package com.weekend.architect.unift.exception;

import com.weekend.architect.unift.remote.exception.CredentialValidationException;
import com.weekend.architect.unift.remote.exception.MaxSessionsExceededException;
import com.weekend.architect.unift.remote.exception.RemoteConnectionException;
import com.weekend.architect.unift.remote.exception.RemotePermissionDeniedException;
import com.weekend.architect.unift.remote.exception.SessionAccessDeniedException;
import com.weekend.architect.unift.remote.exception.SessionExpiredException;
import com.weekend.architect.unift.remote.exception.SessionNotFoundException;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // Auth and user-management exceptions
    @ExceptionHandler(UserAlreadyExistsException.class)
    public ResponseEntity<ErrorResponse> handleUserAlreadyExists(UserAlreadyExistsException ex) {
        log.warn("User already exists error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(errorBody(HttpStatus.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleInvalidCredentials(InvalidCredentialsException ex) {
        log.warn("Invalid credentials error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody(HttpStatus.UNAUTHORIZED, ex.getMessage()));
    }

    @ExceptionHandler(AccountLockedException.class)
    public ResponseEntity<ErrorResponse> handleAccountLocked(AccountLockedException ex) {
        log.warn("Account locked error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.LOCKED).body(errorBody(HttpStatus.LOCKED, ex.getMessage()));
    }

    @ExceptionHandler(TokenInvalidException.class)
    public ResponseEntity<ErrorResponse> handleTokenInvalid(TokenInvalidException ex) {
        log.warn("Token invalid error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody(HttpStatus.UNAUTHORIZED, ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        log.warn("Validation error: {}", ex.getMessage(), ex);
        Map<String, String> fieldErrors = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fe.getField(), fe.getDefaultMessage());
        }
        ErrorResponse body = ErrorResponse.builder()
                .status(HttpStatus.BAD_REQUEST.value())
                .error(HttpStatus.BAD_REQUEST.getReasonPhrase())
                .message("Validation failed")
                .fieldErrors(fieldErrors)
                .timestamp(OffsetDateTime.now())
                .build();
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Bad request: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorBody(HttpStatus.BAD_REQUEST, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("UNEXPECTED ERROR - Stack trace follows:", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorBody(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred"));
    }

    // Remote-connection exceptions

    @ExceptionHandler(SessionNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleSessionNotFound(SessionNotFoundException ex) {
        log.warn("Session not found: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody(HttpStatus.NOT_FOUND, ex.getMessage()));
    }

    @ExceptionHandler(SessionExpiredException.class)
    public ResponseEntity<ErrorResponse> handleSessionExpired(SessionExpiredException ex) {
        log.warn("Session expired: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.GONE).body(errorBody(HttpStatus.GONE, ex.getMessage()));
    }

    @ExceptionHandler(SessionAccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleSessionAccessDenied(SessionAccessDeniedException ex) {
        log.warn("Session access denied: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorBody(HttpStatus.FORBIDDEN, ex.getMessage()));
    }

    @ExceptionHandler(MaxSessionsExceededException.class)
    public ResponseEntity<ErrorResponse> handleMaxSessions(MaxSessionsExceededException ex) {
        log.warn("Max sessions exceeded: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(errorBody(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage()));
    }

    @ExceptionHandler(CredentialValidationException.class)
    public ResponseEntity<ErrorResponse> handleCredentialValidation(CredentialValidationException ex) {
        log.warn("Credential validation error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT)
                .body(errorBody(HttpStatus.UNPROCESSABLE_CONTENT, ex.getMessage()));
    }

    @ExceptionHandler(RemotePermissionDeniedException.class)
    public ResponseEntity<ErrorResponse> handleRemotePermissionDenied(RemotePermissionDeniedException ex) {
        log.warn("Remote permission denied: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorBody(HttpStatus.FORBIDDEN, ex.getMessage()));
    }

    /** Catch-all for any other remote-connection failure (connect errors, transfer errors, browse errors). */
    @ExceptionHandler(RemoteConnectionException.class)
    public ResponseEntity<ErrorResponse> handleRemoteConnection(RemoteConnectionException ex) {
        log.error("Remote connection error: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(errorBody(HttpStatus.BAD_GATEWAY, ex.getMessage()));
    }

    private ErrorResponse errorBody(HttpStatus status, String message) {
        return ErrorResponse.builder()
                .status(status.value())
                .error(status.getReasonPhrase())
                .message(message)
                .timestamp(OffsetDateTime.now())
                .build();
    }
}
