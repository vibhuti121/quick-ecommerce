package com.varsha.payment.service;

import com.varsha.payment.dto.Dtos.ChargeRequest;
import com.varsha.payment.dto.Dtos.PaymentResponse;
import com.varsha.payment.exception.PaymentExceptions.NotFoundException;
import com.varsha.payment.exception.PaymentExceptions.ProviderMisconfiguredException;
import com.varsha.payment.model.Payment;
import com.varsha.payment.model.PaymentStatus;
import com.varsha.payment.provider.ChargeOutcome;
import com.varsha.payment.provider.PaymentProvider;
import com.varsha.payment.repository.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static net.logstash.logback.argument.StructuredArguments.kv;

@Service
public class PaymentService {

    // Structured audit log (observability Pillar 2B): typed `event` + `payload` per charge outcome — the
    // durable dispute trail (cold/1-year tier), the source of truth for "₹X deducted, no order". PII rule:
    // payloads carry money + ids + provider ref/reason ONLY; this service never sees or logs card data (the
    // pilot runs a COD/stub provider). The hashed user_id rides the request MDC set by UserIdMdcFilter.
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final PaymentRepository payments;
    private final PaymentProvider provider;

    public PaymentService(PaymentRepository payments,
                          List<PaymentProvider> providers,
                          @Value("${app.payment.provider}") String providerName) {
        this.payments = payments;
        this.provider = providers.stream()
                .filter(p -> p.name().equalsIgnoreCase(providerName))
                .findFirst()
                .orElseThrow(() -> new ProviderMisconfiguredException(
                        "No PaymentProvider registered under name '" + providerName + "'. Available: "
                                + providers.stream().map(PaymentProvider::name).toList()));
    }

    /**
     * Charge an order. Idempotent on orderId: a repeat call returns the existing payment (its
     * original SUCCESS/FAILED outcome) without charging the gateway again.
     */
    @Transactional
    public PaymentResponse charge(ChargeRequest req) {
        Payment existing = payments.findByOrderId(req.orderId()).orElse(null);
        if (existing != null) {
            return PaymentResponse.from(existing); // idempotent replay
        }

        Payment payment = new Payment();
        payment.setOrderId(req.orderId());
        payment.setAmount(req.amount());
        payment.setCurrency(req.currency());
        payment.setProvider(provider.name());

        ChargeOutcome outcome = provider.charge(req.orderId(), req.amount(), req.currency());
        if (outcome.success()) {
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setProviderRef(outcome.providerRef());
            log.info("payment.succeeded {}", req.orderId(),
                    kv("event", "payment.succeeded"), kv("payload", chargePayload(payment)));
        } else {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureReason(outcome.failureReason());
            log.info("payment.declined {}", req.orderId(),
                    kv("event", "payment.declined"), kv("payload", chargePayload(payment)));
        }
        return PaymentResponse.from(payments.save(payment));
    }

    /**
     * Audit payload for a charge outcome (observability Pillar 2B). PII rule: orderId + money + provider +
     * its ref/reason ONLY — no card data (never captured here) and no customer identity.
     */
    private Map<String, Object> chargePayload(Payment payment) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("orderId", payment.getOrderId());
        p.put("amount", payment.getAmount().toPlainString());
        p.put("currency", payment.getCurrency());
        p.put("provider", payment.getProvider());
        p.put("status", payment.getStatus().name());
        if (payment.getProviderRef() != null) p.put("providerRef", payment.getProviderRef());
        if (payment.getFailureReason() != null) p.put("reason", payment.getFailureReason());
        return p;
    }

    @Transactional(readOnly = true)
    public PaymentResponse getByOrderId(String orderId) {
        return payments.findByOrderId(orderId)
                .map(PaymentResponse::from)
                .orElseThrow(() -> new NotFoundException("No payment for order: " + orderId));
    }
}
