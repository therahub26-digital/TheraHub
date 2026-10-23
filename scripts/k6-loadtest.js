import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'https://www.amethystbdg.my.id';
const PATHS = (__ENV.PATHS || '/,/manager').split(',');

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  const res = http.get(BASE + path, { tags: { page: path } });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
