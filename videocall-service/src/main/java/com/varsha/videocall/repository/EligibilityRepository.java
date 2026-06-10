package com.varsha.videocall.repository;

import com.varsha.videocall.model.Eligibility;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EligibilityRepository extends JpaRepository<Eligibility, Long> {
    boolean existsByUserId(String userId);
}
