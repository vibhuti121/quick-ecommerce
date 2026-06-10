package com.varsha.catalog.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Public notify-me signup body. The storefront already normalizes/validates these, but the endpoint is
 * public so the server re-validates (defence in depth): topic is a short key, phone must be a 10-digit
 * Indian mobile, email is optional.
 */
public record NotifyRequest(
        @NotBlank @Size(max = 32) String topic,
        @NotBlank @Pattern(regexp = "^[6-9]\\d{9}$", message = "must be a 10-digit Indian mobile") String phone,
        @Email @Size(max = 255) String email
) {}
