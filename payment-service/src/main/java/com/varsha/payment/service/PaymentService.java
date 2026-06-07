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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PaymentService {

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
        } else {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setFailureReason(outcome.failureReason());
        }
        return PaymentResponse.from(payments.save(payment));
    }

    @Transactional(readOnly = true)
    public PaymentResponse getByOrderId(String orderId) {
        return payments.findByOrderId(orderId)
                .map(PaymentResponse::from)
                .orElseThrow(() -> new NotFoundException("No payment for order: " + orderId));
    }
}
