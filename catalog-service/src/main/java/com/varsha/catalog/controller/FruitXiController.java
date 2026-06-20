package com.varsha.catalog.controller;

import com.varsha.catalog.dto.AutofillRequest;
import com.varsha.catalog.dto.AutofillResponse;
import com.varsha.catalog.dto.FruitBoxRequest;
import com.varsha.catalog.dto.FruitBoxResponse;
import com.varsha.catalog.dto.FruitXiTeam;
import com.varsha.catalog.service.FruitXiService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Fruit XI fan-box API — thin transport layer only; all rules live in {@link FruitXiService}.
 *
 * <p>Mounted under {@code /api/catalog/fruit-xi/**} so it rides the existing gateway
 * {@code Path=/api/catalog/**} route without any gateway routing change.
 * The {@code /api/catalog/fruit-xi} prefix is added to gateway {@code PUBLIC_PATHS}
 * (AuthFilter.java) so anonymous fans can use these endpoints.
 *
 * <ul>
 *   <li>GET  /api/catalog/fruit-xi/teams    → list of WC-2026 teams</li>
 *   <li>POST /api/catalog/fruit-xi/box      → fan-box composition</li>
 *   <li>POST /api/catalog/fruit-xi/autofill → deterministic colour-matched 11-slot fill</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/catalog/fruit-xi")
public class FruitXiController {

    private final FruitXiService service;

    public FruitXiController(FruitXiService service) {
        this.service = service;
    }

    /** Returns the static list of curated WC-2026 teams. */
    @GetMapping("/teams")
    public List<FruitXiTeam> teams() {
        return service.listTeams();
    }

    /**
     * Compose a fan box from a caller-supplied lineup.
     * Rules: dedupe, honey-exclusion, missing/inactive-exclusion, server-summed total.
     */
    @PostMapping("/box")
    public FruitBoxResponse box(@RequestBody FruitBoxRequest req) {
        return service.composeBox(req.team(), req.lineup());
    }

    /**
     * Deterministically fill an 11-slot fan box matched to the team's kit colours.
     * Same team + same catalogue always returns byte-identical ordering.
     */
    @PostMapping("/autofill")
    public AutofillResponse autofill(@RequestBody AutofillRequest req) {
        return service.autofill(req.team());
    }
}
