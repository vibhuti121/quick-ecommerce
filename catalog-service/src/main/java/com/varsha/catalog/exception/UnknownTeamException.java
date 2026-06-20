package com.varsha.catalog.exception;

public class UnknownTeamException extends RuntimeException {
    public UnknownTeamException(String team) {
        super("Unknown team code: " + team);
    }
}
