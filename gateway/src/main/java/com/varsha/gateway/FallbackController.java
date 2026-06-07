package com.varsha.gateway;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;

@RestController
public class FallbackController {

    @RequestMapping("/fallback/unavailable")
    public Mono<ProblemDetail> unavailable(ServerWebExchange exchange) {
        exchange.getResponse().setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.SERVICE_UNAVAILABLE);
        problem.setType(URI.create("urn:problem:service-unavailable"));
        problem.setTitle("Service Unavailable");
        problem.setDetail("The upstream service is temporarily unavailable. Please retry in a few seconds.");
        return Mono.just(problem);
    }
}
