package com.varsha.auth.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class MdcFilter extends OncePerRequestFilter {

    private static final String CORRELATION_HEADER = "X-Correlation-ID";
    private static final String USER_ID_HEADER     = "X-User-Id";

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain)
            throws ServletException, IOException {
        try {
            String correlationId = request.getHeader(CORRELATION_HEADER);
            if (correlationId != null && !correlationId.isBlank()) {
                MDC.put("correlationId", correlationId);
                response.setHeader(CORRELATION_HEADER, correlationId);
            }
            String userId = request.getHeader(USER_ID_HEADER);
            if (userId != null && !userId.isBlank()) {
                MDC.put("userId", userId);
            }
            chain.doFilter(request, response);
        } finally {
            MDC.remove("correlationId");
            MDC.remove("userId");
        }
    }
}
