package com.varsha.catalog.dto;

import java.util.List;

/**
 * Admin "Demand" dashboard payload — the aggregated view of launch-interest the founder reads at
 * {@code GET /api/catalog/admin/notify/demand}. All counts are computed in-DB ({@code GROUP BY}) so the
 * endpoint stays cheap as signups grow. No raw PII beyond the {@code recent} leads (which the admin is
 * already authorised to see via {@code /admin/notify}).
 *
 * @param totalRows     every notify_signups row (umbrella 'quiz'/'teaser' rows + one per chosen fruit)
 * @param distinctPeople distinct phone numbers — the true headcount on the waitlist
 * @param byFruit       demand per topic (fruit slug, or 'quiz'/'honey'/… umbrella), most-wanted first
 * @param byState       signups per state/UT (location demand), most first; rows with no state are omitted
 * @param recent        the latest leads (contact + location), newest first, capped for the dashboard
 */
public record DemandResponse(
        long totalRows,
        long distinctPeople,
        List<TopicDemand> byFruit,
        List<StateDemand> byState,
        List<NotifyResponse> recent
) {
    public record TopicDemand(String topic, long signups, long people) {}
    public record StateDemand(String state, long signups) {}
}
