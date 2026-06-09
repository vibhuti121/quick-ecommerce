package com.varsha.order.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Defense-in-depth admin guard for the COD pilot. Admin order endpoints live under
 * {@code /admin/orders/**}, which the gateway does not route and order-service does not publish — so
 * they are not reachable from the public edge at all. This filter is the innermost layer: it requires
 * {@code X-User-Role=ADMIN} (set by the isolated admin app's nginx) on every {@code /admin/orders/**}
 * request, so even a misroute inside the docker network fails closed.
 *
 * <p>Customer-facing {@code /api/orders/**} traffic is untouched.
 *
 * <p>Residual risk: an actor already INSIDE the docker network can forge {@code X-User-Role}. Closing
 * that needs service-to-service auth (mTLS or a signed header) plus a proper admin JWT — a later
 * hardening step. For the pilot, the admin app is bound to 127.0.0.1 + basic-auth, so there is nothing
 * on the internet to reach this path.
 */
@Component
public class AdminRoleFilter extends OncePerRequestFilter {

    private static final String ADMIN_PREFIX = "/admin/orders";

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
