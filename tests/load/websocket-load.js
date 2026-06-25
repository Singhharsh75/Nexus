import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsMessageCount = new Counter('ws_messages_received');
const wsFailRate = new Rate('ws_failures');

const SUPABASE_URL = __ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN || '';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '';

const HEARTBEAT_INTERVAL_MS = 15000;
const CONNECTION_DURATION_MS = 60000;

const WS_URL = SUPABASE_URL.replace('https://', 'wss://') +
  `/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

export const options = {
  scenarios: {
    websocket_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    ws_connect_duration: ['p(95)<5000'],
    ws_failures: ['rate<0.05'],
  },
};

export default function () {
  const connectStart = Date.now();

  const res = ws.connect(WS_URL, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }, function (socket) {
    const connectTime = Date.now() - connectStart;
    wsConnectDuration.add(connectTime);

    let heartbeatRef = 2;

    socket.on('open', function () {
      const joinPayload = JSON.stringify({
        topic: `realtime:workspace:${WORKSPACE_ID}`,
        event: 'phx_join',
        payload: {},
        ref: '1',
      });
      socket.send(joinPayload);
    });

    socket.on('message', function () {
      wsMessageCount.add(1);
    });

    socket.on('error', function () {
      wsFailRate.add(true);
    });

    socket.setInterval(function () {
      const heartbeat = JSON.stringify({
        topic: 'phoenix',
        event: 'heartbeat',
        payload: {},
        ref: String(heartbeatRef++),
      });
      socket.send(heartbeat);
    }, HEARTBEAT_INTERVAL_MS);

    socket.setTimeout(function () {
      socket.close();
    }, CONNECTION_DURATION_MS);
  });

  const connected = check(res, {
    'ws connected successfully': (r) => r && r.status === 101,
  });

  if (!connected) {
    wsFailRate.add(true);
  }

  sleep(1);
}
