package com.varsha.catalog.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Body of POST /api/catalog/taste/profile/merge: {@code { deviceProgress: { ...DeviceTasteProgress } }}.
 * The device snapshot is merged INTO the account on login so guest-earned progress carries over
 * (union of discovered fruits + badges, max of XP + streak, latest persona/state/pincode/affinity).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TasteMergeRequest(TasteProgressUpdate deviceProgress) {
}
