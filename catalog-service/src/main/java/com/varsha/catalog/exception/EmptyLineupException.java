package com.varsha.catalog.exception;

public class EmptyLineupException extends RuntimeException {
    public EmptyLineupException() {
        super("lineup must not be null or empty");
    }
}
