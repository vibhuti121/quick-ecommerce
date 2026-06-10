package com.varsha.auth.service;

/**
 * Thrown by registration when the email/phone is already taken. Registration inherently reveals
 * existence (you cannot create an account that already exists), so the controller maps this to a
 * 409 with a clear message — login and OTP, by contrast, stay deliberately generic.
 */
public class DuplicateAccountException extends RuntimeException {
    public DuplicateAccountException() {
        super("account already exists");
    }
}
