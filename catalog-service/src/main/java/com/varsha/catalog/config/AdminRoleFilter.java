package com.varsha.catalog.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Defense-in-depth admin guard (Phase 3, Pillar 1). The gateway is the primary RBAC boundary: it
 * validates the JWT and 403s non-admins before they reach this service. This filter additionally
 * requires the gateway-set {@code X-User-Role=ADMIN} header on every {@code /api/catalog/admin/**}
 * request, so a misroute that skips the gateway's role check still fails closed here.
 *
 * <p>Residual risk: an actor already INSIDE the docker network can forge {@code X-User-Role}, since
 * the service cannot yet distinguish gateway traffic from peer traffic. Closing that needs
 * service-to-service authentication (mTLS or a signed gateway header) — a later pillar.
 */
@Component
public class AdminRoleFilter extends OncePerRequestFilter {

    private static final String ADMIN_PREFIX = "/api/catalog/admin";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (request.getRequestURI().startsWith(ADMIN_PREFIX)
                && !"ADMIN".equals(request.getHeader("X-User-Role"))) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "admin role required");
            return;
        }
        chain.doFilter(request, response);
    }
}
