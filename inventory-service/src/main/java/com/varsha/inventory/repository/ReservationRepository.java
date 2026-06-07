package com.varsha.inventory.repository;

import com.varsha.inventory.model.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    Optional<Reservation> findByOrderId(String orderId);
}
