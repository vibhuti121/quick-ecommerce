package com.varsha.auth.service.sms;

/**
 * The single seam where OTP delivery costs money. Today the only implementation is
 * {@link LoggingSmsSender} (free dev stub). At go-live a real provider (MSG91 / Fast2SMS / WhatsApp)
 * drops in behind this interface — isolated to one class, gated by config — after DLT registration.
 */
public interface SmsSender {
    /** Deliver the one-time code to the phone. Implementations must not throw on a normal failure
     *  in a way that reveals delivery success/failure to the caller (anti-enumeration). */
    void sendOtp(String phone, String code);
}
