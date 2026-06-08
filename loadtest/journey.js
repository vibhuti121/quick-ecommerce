// Full guest-journey load test (Phase 2, Pillar 3).
//
// Exercises the end-to-end purchase path through the GATEWAY, the same way the storefront does:
//   guest token  ->  browse  ->  product detail  ->  add to cart  ->  checkout
// This stresses the edge (rate-limit, auth, correlation-id filters), auth, catalog (cached),
// cart (Redis), and order (outbox -> inventory + payment).
//
// EDGE RATE LIMIT: the gateway throttles to 100 req/min PER CLIENT IP (keyed on
// X-Forwarded-For). A real load test = many distinct clients, so each VU presents its own
// X-Forwarded-For and paces itself under the per-client budget. Pushing all traffic from one
// IP would (correctly) get 429'd — that guard is validated separately, see README.
//
// Run inside the compose network:
//   docker run --rm --network quick-ecommerce_default \
//     -e BASE_URL=http://gateway:8080 -v "$PWD/loadtest:/scripts" \
//     grafana/k6 run /scripts/journey.js
//
// Override load with -e VUS=20 -e DURATION=1m.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://gateway:8080';
const VUS = parseInt(__ENV.VUS || '15', 10);
const DURATION = __ENV.DURATION || '45s';

const journeyErrors = new Rate('journey_errors');
const ordersAccepted = new Rate('orders_accepted');

export const options = {
  scenarios: {
    journey: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],               // <2% — journey has more moving parts than browse
    http_req_duration: ['p(95)<1500'],            // p95 under 1.5s for the heaviest call (checkout)
    journey_errors: ['rate<0.02'],
    orders_accepted: ['rate>0.95'],               // >95% of checkouts return 202
    checks: ['rate>0.98'],
  },
};

// Each VU is a distinct simulated client. 198.18.0.0/15 is the IANA benchmarking range —
// safe, non-routable, and exactly the right semantic here. This gives every VU its own
// gateway rate-limit bucket, matching how N real users would arrive via the edge proxy.
function clientIp() {
  const n = __VU; // 1-based
  return `198.18.${Math.floor(n / 254)}.${(n % 254) + 1}`;
}

export default function () {
  const ip = clientIp();
  const baseHeaders = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip };
  let failed = false;

  // 1) Guest token
  const authRes = http.post(`${BASE}/auth/guest`, JSON.stringify({ name: `load-${__VU}` }), {
    headers: baseHeaders,
    tags: { name: 'auth_guest' },
  });
  const tokenOk = check(authRes, {
    'guest 200': (r) => r.status === 200,
    'guest has token': (r) => {
      try { return !!r.json('token'); } catch (e) { return false; }
    },
  });
  if (!tokenOk) { journeyErrors.add(true); return; }
  const token = authRes.json('token');
  const authHeaders = { ...baseHeaders, Authorization: `Bearer ${token}` };

  // 2) Browse (public, cached)
  const listRes = http.get(`${BASE}/api/catalog/products?page=0&size=20`, {
    headers: baseHeaders, tags: { name: 'browse_list' },
  });
  failed = !check(listRes, { 'browse 200': (r) => r.status === 200 }) || failed;

  // 3) Pick a product from the page and open its detail (cached)
  let product;
  try {
    const content = listRes.json('content');
    product = content[Math.floor(Math.random() * content.length)];
  } catch (e) {
    journeyErrors.add(true);
    return;
  }
  const detailRes = http.get(`${BASE}/api/catalog/products/${product.id}`, {
    headers: authHeaders, tags: { name: 'product_detail' },
  });
  failed = !check(detailRes, { 'detail 200': (r) => r.status === 200 }) || failed;

  sleep(Math.random() * 0.7 + 0.6); // 0.6..1.3s — realistic browse think time, also paces under the per-client limit

  // 4) Add to cart (auth required)
  const cartRes = http.post(
    `${BASE}/api/cart/items`,
    JSON.stringify({ productId: product.id, quantity: 1 }),
    { headers: authHeaders, tags: { name: 'cart_add' } },
  );
  failed = !check(cartRes, {
    'cart 200': (r) => r.status === 200,
    'cart has item': (r) => {
      try { return r.json('itemCount') >= 1; } catch (e) { return false; }
    },
  }) || failed;

  sleep(Math.random() * 0.7 + 0.6);

  // 5) Checkout (auth + Idempotency-Key required). Build the line item from the product.
  const idempotencyKey = `${__VU}-${__ITER}-${Date.now()}`;
  const checkoutBody = JSON.stringify({
    currency: product.currency || 'INR',
    items: [{
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unitPrice: product.basePrice,
      quantity: 1,
    }],
  });
  const checkoutRes = http.post(`${BASE}/api/orders/checkout`, checkoutBody, {
    headers: { ...authHeaders, 'Idempotency-Key': idempotencyKey },
    tags: { name: 'checkout' },
  });
  const checkoutOk = check(checkoutRes, {
    'checkout 202': (r) => r.status === 202,
    'checkout has orderId': (r) => {
      try { return !!r.json('orderId'); } catch (e) { return false; }
    },
  });
  ordersAccepted.add(checkoutRes.status === 202);
  failed = !checkoutOk || failed;

  journeyErrors.add(failed);
  sleep(Math.random() * 0.7 + 0.8); // 0.8..1.5s before this VU's next journey
}
