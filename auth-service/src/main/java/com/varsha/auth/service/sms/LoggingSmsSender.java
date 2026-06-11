package com.varsha.auth.service.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Dev stub — the default (and only) SmsSender until a real provider is wired at go-live. It does NOT
 * send a real SMS: it logs the code so a developer/CI can read it from the auth-service logs. Costs ₹0.
 * A real {@code Msg91SmsSender} etc. will replace this behind @ConditionalOnProperty when going live.
 */
@Component
public class LoggingSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingSmsSender.class);

    @Override
    public void sendOtp(String phone, String code) {
        // Log only the last 4 digits of the phone; the full code is dev-only and never goes to a real
        // recipient through this impl. (The JSON echo path is separately gated by app.otp.dev-echo.)
        String masked = phone.length() > 4 ? "****" + phone.substring(phone.length() - 4) : "****";
        log.info("[DEV SMS] OTP for {} = {} (LoggingSmsSender — no real SMS sent)", masked, code);
    }
}
