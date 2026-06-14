package com.varsha.catalog.repository;

import com.varsha.catalog.model.TasteProfile;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * One row per authenticated account, keyed by the auth user id (String PK). The taste-profile upsert
 * and the device-&gt;account merge both go through {@code findById(userId)} → mutate → {@code save}.
 */
public interface TasteProfileRepository extends JpaRepository<TasteProfile, String> {
}
