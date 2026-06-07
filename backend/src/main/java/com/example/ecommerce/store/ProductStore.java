package com.example.ecommerce.store;

import com.example.ecommerce.model.Product;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
public class ProductStore {

    private final List<Product> products = List.of(
            new Product(1, "Aurora Wireless Headphones",
                    "Over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life.",
                    199.99, "https://picsum.photos/seed/1/400/300", "Electronics"),
            new Product(2, "Pulse Smartwatch",
                    "Fitness-focused smartwatch with heart-rate monitoring, GPS, and AMOLED display.",
                    149.50, "https://picsum.photos/seed/2/400/300", "Electronics"),
            new Product(3, "Nimbus Mechanical Keyboard",
                    "Hot-swappable 75% mechanical keyboard with RGB backlighting and PBT keycaps.",
                    89.00, "https://picsum.photos/seed/3/400/300", "Electronics"),
            new Product(4, "Everyday Cotton Tee",
                    "Soft 100% organic cotton crew-neck t-shirt, pre-shrunk and breathable.",
                    24.99, "https://picsum.photos/seed/4/400/300", "Apparel"),
            new Product(5, "Trailhead Running Shoes",
                    "Lightweight trail running shoes with cushioned midsole and grippy outsole.",
                    119.95, "https://picsum.photos/seed/5/400/300", "Apparel"),
            new Product(6, "Brew Master Pour-Over Set",
                    "Ceramic pour-over coffee dripper with borosilicate glass carafe and reusable filter.",
                    39.99, "https://picsum.photos/seed/6/400/300", "Home")
    );

    public List<Product> findAll() {
        return products;
    }

    public Optional<Product> findById(long id) {
        return products.stream().filter(p -> p.id() == id).findFirst();
    }
}
