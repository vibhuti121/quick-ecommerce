package com.varsha.order.client;

import com.varsha.order.client.ClientExceptions.BusinessRejectionException;
import com.varsha.order.client.ClientExceptions.ServiceUnavailableException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;

/**
 * Calls payment-service to capture funds for an order. The charge is idempotent on orderId.
 * Returns the gateway's terminal verdict (SUCCESS/FAILED); throws only on transient failures.
 */
@Component
public class PaymentClient {

    private final RestClient http;

    public PaymentClient(RestClient paymentRestClient) {
        this.http = paymentRestClient;
    }

    private record ChargeBody(String orderId, BigDecimal amount, String currency) {}

    private record ChargeResponse(String status, String failureReason) {}

    /** @return true if the charge succeeded, false if the gateway declined it. */
    public boolean charge(String orderId, BigDecimal amount, String currency) {
        try {
            ChargeResponse resp = http.post()
                    .uri("/api/payments/charge")
                    .body(new ChargeBody(orderId, amount, currency))
                    .retrieve()
                    .onStatus(s -> s.is4xxClientError(), (req, res) -> {
                        throw new BusinessRejectionException(
                                "payment charge rejected: HTTP " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is5xxServerError(), (req, res) -> {
                        throw new ServiceUnavailableException(
                                "payment charge failed: HTTP " + res.getStatusCode());
                    })
                    .body(ChargeResponse.class);
            return resp != null && "SUCCESS".equals(resp.status());
        } catch (ResourceAccessException e) {
            throw new ServiceUnavailableException("payment unreachable: " + e.getMessage());
        }
    }
}
