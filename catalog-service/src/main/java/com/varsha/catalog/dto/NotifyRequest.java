package com.varsha.catalog.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Public notify-me / fruit-quiz signup body. The storefront already normalizes/validates these, but the
 * endpoint is public so the server re-validates (defence in depth).
 *
 * <p>Two capture surfaces share this body:
 * <ul>
 *   <li><b>Honey teaser</b> — sends a single {@code topic} ('honey' | 'litchi' | 'gi' | 'delivery'),
 *       no {@code fruits}. Behaviour is exactly as before (one row per topic+phone).</li>
 *   <li><b>Fruit quiz</b> — sends {@code topic="quiz"} plus a {@code fruits} list of the chosen fruit
 *       slugs. The service fans those out to one row per fruit so per-fruit demand is a free aggregate.</li>
 * </ul>
 * {@code name} and {@code source} are optional (the older teaser path omits them). Location (pincode +
 * resolved city/state) is required on submit, as before.
 */
public record NotifyRequest(
        @NotBlank @Size(max = 32) String topic,
        @Size(max = 128) String name,
        @Size(max = 32) String source,
        @Size(max = 24, message = "at most 24 fruits") List<@Pattern(regexp = "^[a-z0-9-]{1,32}$",
                message = "fruit must be a lowercase slug") String> fruits,
        @NotBlank @Pattern(regexp = "^[6-9]\\d{9}$", message = "must be a 10-digit Indian mobile") String phone,
        @Email @Size(max = 255) String email,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "must be a 6-digit pincode") String pincode,
        @NotBlank @Size(max = 128) String city,
        @NotBlank @Size(max = 128) String state
) {}
