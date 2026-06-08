package com.varsha.catalog.service;

import com.varsha.catalog.model.Product;
import com.varsha.catalog.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * On startup, gives every product a real image served from MinIO instead of an external placeholder
 * (Phase 2, Pillar 4). For each product whose {@code imageUrl} is still empty or points at the old
 * picsum placeholder, it generates a deterministic SVG tile, uploads it, and rewrites the URL.
 *
 * <p>Idempotent: once a product points at MinIO it is skipped, so this is a no-op on later restarts.
 * Resilient: if MinIO is unreachable the catalog still boots and serves — images simply keep their
 * old URLs until the next successful start.
 */
@Component
public class SeedImageInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedImageInitializer.class);

    private static final int BUCKET_RETRIES = 10;
    private static final long RETRY_SLEEP_MS = 2000L;

    private final ProductRepository products;
    private final ObjectStorageService storage;
    private final ProductCacheService cache;

    public SeedImageInitializer(ProductRepository products, ObjectStorageService storage,
                                ProductCacheService cache) {
        this.products = products;
        this.storage = storage;
        this.cache = cache;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            awaitBucket();
            seedImages();
        } catch (Exception e) {
            // Never block startup on object storage — the catalog must serve even if MinIO is down.
            log.warn("Skipping product-image seeding (object storage unavailable): {}", e.toString());
        }
    }

    private void awaitBucket() throws InterruptedException {
        for (int attempt = 1; ; attempt++) {
            try {
                storage.ensureBucket();
                return;
            } catch (Exception e) {
                if (attempt >= BUCKET_RETRIES) {
                    throw new IllegalStateException("object-storage bucket not ready after "
                            + BUCKET_RETRIES + " attempts", e);
                }
                log.info("Waiting for object storage (attempt {}/{}): {}", attempt, BUCKET_RETRIES, e.toString());
                Thread.sleep(RETRY_SLEEP_MS);
            }
        }
    }

    private void seedImages() {
        // Each updateImageUrl runs in its own transaction (annotated on the repository method), so the
        // read here needs no surrounding tx and a single failure can't roll back already-seeded images.
        List<Product> all = products.findAll();
        int seeded = 0;
        for (Product p : all) {
            if (!needsSeedImage(p.getImageUrl())) {
                continue;
            }
            byte[] svg = renderSvg(p).getBytes(StandardCharsets.UTF_8);
            String key = "products/" + p.getId() + "/seed.svg";
            String url = storage.upload(key, svg, "image/svg+xml");
            products.updateImageUrl(p.getId(), url);
            cache.evictProduct(p.getId());
            seeded++;
        }
        if (seeded > 0) {
            // A Redis that survived from before this migration may still hold the old (picsum) pages.
            cache.evictBrowse();
            log.info("Seeded {} product image(s) into object storage", seeded);
        } else {
            log.info("Product images already in object storage — nothing to seed");
        }
    }

    private static boolean needsSeedImage(String imageUrl) {
        return imageUrl == null || imageUrl.isBlank() || imageUrl.contains("picsum");
    }

    /**
     * A self-contained SVG tile: a deterministic background colour (hashed from the name so it is
     * stable across runs) with the product name and category. Text-based, so no image library or
     * bundled binary assets are needed, and it renders directly in an {@code <img>} tag.
     */
    private static String renderSvg(Product p) {
        String name = p.getName() == null ? "Product" : p.getName();
        String category = p.getCategory() == null ? "" : p.getCategory();
        int hue = Math.floorMod(name.hashCode(), 360);
        String bg = "hsl(" + hue + ", 62%, 48%)";
        String bgDark = "hsl(" + hue + ", 62%, 32%)";
        return """
                <svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="%s"/>
                      <stop offset="1" stop-color="%s"/>
                    </linearGradient>
                  </defs>
                  <rect width="600" height="600" fill="url(#g)"/>
                  <text x="300" y="300" fill="#ffffff" font-family="Helvetica, Arial, sans-serif"
                        font-size="40" font-weight="700" text-anchor="middle">%s</text>
                  <text x="300" y="350" fill="#ffffff" fill-opacity="0.8"
                        font-family="Helvetica, Arial, sans-serif" font-size="22" text-anchor="middle">%s</text>
                </svg>
                """.formatted(bg, bgDark, escape(name), escape(category));
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
