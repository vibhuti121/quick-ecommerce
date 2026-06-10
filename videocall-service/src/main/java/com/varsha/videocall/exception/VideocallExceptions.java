package com.varsha.videocall.exception;

/** Domain exceptions for the videocall service. */
public final class VideocallExceptions {

    private VideocallExceptions() {
    }

    /** No usable identity on the request (missing X-User-Id) — should not happen behind the gateway. */
    public static class UnauthorizedException extends RuntimeException {
        public UnauthorizedException(String message) {
            super(message);
        }
    }

    /** Authenticated but not permitted — e.g. a guest token trying to record eligibility. */
    public static class ForbiddenException extends RuntimeException {
        public ForbiddenException(String message) {
            super(message);
        }
    }
}
