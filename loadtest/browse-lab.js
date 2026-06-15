// Scaling-Quest lab variant of browse.js — identical load shape, but DATA-DRIVEN:
// setup() discovers live product ids from the catalog instead of hardcoding 1..9
// (the original fixture rotted as the local DB accumulated/disabled products,
// producing 404s that looked like a 22% error rate — a false alarm).
//
// Run inside the compose network:
//   docker run --rm --network quick-ecommerce_default \
//     -e BASE_URL=http://catalog-service:8090 -v "$PWD/loadtest:/scripts" \
//     grafana/k6 run /scripts/browse-lab.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://catalog-service:8090';
const VUS = parseInt(__ENV.VUS || '50', 10);
const DURATION = __ENV.DURATION || '45s';

const browseErrors = new Rate('browse_errors');

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400'],
    browse_errors: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

// Runs ONCE before any VU starts; its return value is handed to every iteration.
export function setup() {
  const res = http.get(`${BASE}/api/catalog/products?page=0&size=200`);
  const ids = res.json('content').map((p) => p.id);
  if (!ids.length) throw new Error('setup: catalog returned no products');
  console.log(`setup: discovered ${ids.length} live product ids`);
  return { ids };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function (data) {
  const page = Math.floor(Math.random() * 2);
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

  const id = pick(data.ids);
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

  sleep(Math.random() * 0.5 + 0.2);
}
