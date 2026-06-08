// Catalog browse hot-path load test (Phase 2, Pillar 3).
//
// Measures the catalog read path's throughput/latency and makes the Pillar-1 Redis
// read-through cache benefit visible — watch cache_gets_total{result="hit"} climb on the
// Grafana "Catalog Cache & Services" dashboard while this runs.
//
// TARGET: catalog-service DIRECTLY (http://catalog-service:8090), NOT the gateway.
// The gateway enforces a deliberate per-client-IP rate limit (100 req/min, see
// gateway RateLimitFilter) — an edge abuse-guard, not app capacity. To measure the
// app + cache we bypass that guard and hit the service. (Use journey.js to exercise
// the full edge path with realistic per-client pacing.)
//
// Run inside the compose network:
//   docker run --rm --network quick-ecommerce_default \
//     -e BASE_URL=http://catalog-service:8090 -v "$PWD/loadtest:/scripts" \
//     grafana/k6 run /scripts/browse.js
//
// Override load with -e VUS=80 -e DURATION=2m.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://catalog-service:8090';
const VUS = parseInt(__ENV.VUS || '50', 10);
const DURATION = __ENV.DURATION || '45s';

// Seeded catalog currently has 9 products (ids 1..9). Detail hits a small id set so
// the per-product cache actually gets reused across VUs instead of always missing.
const PRODUCT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const browseErrors = new Rate('browse_errors');

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: VUS },        // ramp up
        { duration: DURATION, target: VUS },      // steady state — cache warms here
        { duration: '5s', target: 0 },            // ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],               // <1% errors
    http_req_duration: ['p(95)<400'],             // p95 under 400ms (cached reads are cheap)
    browse_errors: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  // 1) Browse a page of products (cache: catalog:browse)
  const page = Math.floor(Math.random() * 2); // pages 0..1
  const listRes = http.get(`${BASE}/api/catalog/products?page=${page}&size=20`, {
    tags: { name: 'browse_list' },
  });
  const listOk = check(listRes, {
    'browse 200': (r) => r.status === 200,
    'browse has content': (r) => {
      try { return Array.isArray(r.json('content')); } catch (e) { return false; }
    },
  });
  browseErrors.add(!listOk);

  // 2) Open a product detail page (cache: catalog:product)
  const id = pick(PRODUCT_IDS);
  const detailRes = http.get(`${BASE}/api/catalog/products/${id}`, {
    tags: { name: 'product_detail' },
  });
  const detailOk = check(detailRes, {
    'detail 200': (r) => r.status === 200,
    'detail has id': (r) => {
      try { return r.json('id') === id; } catch (e) { return false; }
    },
  });
  browseErrors.add(!detailOk);

  sleep(Math.random() * 0.5 + 0.2); // 0.2..0.7s think time
}
