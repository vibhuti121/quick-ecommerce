package com.varsha.auth.exception;

import io.jsonwebtoken.JwtException;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, List<String>> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.groupingBy(
                        FieldError::getField,
                        Collectors.mapping(FieldError::getDefaultMessage, Collectors.toList())));
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        pd.setType(URI.create("https://api/errors/validation"));
        pd.setProperty("fieldErrors", fieldErrors);
        pd.setProperty("correlationId", MDC.get("correlationId"));
        pd.setProperty("timestamp", Instant.now());
        return ResponseEntity.badRequest().body(pd);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ProblemDetail> handleMissingHeader(MissingRequestHeaderException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Missing required header: " + ex.getHeaderName());
        pd.setType(URI.create("https://api/errors/validation"));
        pd.setProperty("correlationId", MDC.get("correlationId"));
        pd.setProperty("timestamp", Instant.now());
        return ResponseEntity.badRequest().body(pd);
    }

    @ExceptionHandler(JwtException.class)
    public ResponseEntity<ProblemDetail> handleJwt(JwtException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        pd.setType(URI.create("https://api/errors/authentication"));
        pd.setProperty("correlationId", MDC.get("correlationId"));
        pd.setProperty("timestamp", Instant.now());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(pd);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleGeneric(Exception ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
        pd.setType(URI.create("https://api/errors/internal"));
        pd.setProperty("correlationId", MDC.get("correlationId"));
        pd.setProperty("timestamp", Instant.now());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(pd);
    }
}
