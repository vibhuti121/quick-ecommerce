// Edge rate-limit verification (Phase 2, Pillar 3).
//
// Proves the gateway's per-client-IP token bucket works: from a SINGLE client IP, fire well
// past the 100-req/min budget and assert the gateway starts returning 429 with the
// problem+json body and X-RateLimit headers. This is the guard that (correctly) throttled the
// naive single-IP load test — here we verify it on purpose.
//
// Run inside the compose network:
//   docker run --rm --network quick-ecommerce_default \
//     -e BASE_URL=https://gateway:8443 -v "$PWD/loadtest:/scripts" \
//     grafana/k6 run /scripts/ratelimit.js
//
// The edge is HTTPS with a dev self-signed cert (Pillar 4); options.insecureSkipTLSVerify accepts it.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://gateway:8443';
const BURST = parseInt(__ENV.BURST || '150', 10); // > capacity (100) so we must hit the limit

const got200 = new Counter('rl_200');
const got429 = new Counter('rl_429');

export const options = {
  insecureSkipTLSVerify: true, // edge serves a dev self-signed cert (Pillar 4)
  scenarios: {
    burst: { executor: 'shared-iterations', vus: 10, iterations: BURST, maxDuration: '30s' },
  },
  thresholds: {
    // The guard must engage: at least some requests are throttled, and the allowed count
    // does not wildly exceed the configured capacity.
    rl_429: ['count>0'],
    rl_200: ['count<=120'], // capacity 100 + a little refill slack during the burst
  },
};

// All iterations share one client identity so they compete for one bucket.
const FIXED_IP = '203.0.113.7'; // TEST-NET-3, a single fictional client

export default function () {
  const res = http.get(`${BASE}/api/catalog/products?page=0&size=5`, {
    headers: { 'X-Forwarded-For': FIXED_IP },
    tags: { name: 'ratelimit_probe' },
  });
  if (res.status === 200) got200.add(1);
  if (res.status === 429) got429.add(1);

  check(res, {
    '200 or 429 only': (r) => r.status === 200 || r.status === 429,
    'has X-RateLimit-Limit header': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
    '429 carries problem+json': (r) =>
      r.status !== 429 || String(r.body).includes('rate-limit-exceeded'),
  });
}
