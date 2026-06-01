const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Enable collection of default Node.js/V8 runtime metrics
// This automatically populates metrics like memory usage, CPU, event loop lag, etc.
client.collectDefaultMetrics({ prefix: 'nodejs_' });

// Define custom Prometheus metrics for HTTP traffic
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0] // Buckets matching our 200ms latency SLO
});

const httpInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of active HTTP requests currently being processed',
  labelNames: ['method', 'route']
});

// Chaos Configuration State
let chaosConfig = {
  extraLatencyMs: 0,
  errorRate: 0.0
};

// Middleware to measure HTTP request metrics (Traffic, Latency, Errors, Saturation)
app.use((req, res, next) => {
  // Exclude administrative and metrics endpoints from chaos and main metrics tracking
  if (req.path.startsWith('/api/chaos') || req.path === '/metrics') {
    return next();
  }

  const start = process.hrtime();
  const method = req.method;
  const route = req.route ? req.route.path : req.path;

  // Track concurrent in-flight requests
  httpInFlight.inc({ method, route });

  // Handle Response Logging on completion
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const statusCode = res.statusCode;

    // Record traffic and latency metrics
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDuration.observe({ method, route, status_code: statusCode }, durationInSeconds);
    httpInFlight.dec({ method, route });
  });

  // Chaos Injection 1: Error Rate Simulator
  if (Math.random() < chaosConfig.errorRate) {
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error (Simulated Chaos Fault Injection)'
    });
    return;
  }

  // Chaos Injection 2: Latency Simulator
  if (chaosConfig.extraLatencyMs > 0) {
    setTimeout(next, chaosConfig.extraLatencyMs);
  } else {
    next();
  }
});

// --- Core API Endpoint ---
app.get('/api/v1/resource', (req, res) => {
  res.json({
    status: 'success',
    timestamp: new Date().toISOString(),
    data: {
      id: Math.floor(Math.random() * 1000),
      message: 'Operational database read successful'
    }
  });
});

// --- Chaos Engineering Admin Endpoints ---
app.post('/api/chaos/inject', (req, res) => {
  const { latency, errorRate } = req.body;

  if (latency !== undefined) {
    chaosConfig.extraLatencyMs = parseInt(latency, 10);
  }
  if (errorRate !== undefined) {
    chaosConfig.errorRate = parseFloat(errorRate);
  }

  console.log(`[Chaos Admin] Injected chaos settings: Latency=${chaosConfig.extraLatencyMs}ms, ErrorRate=${(chaosConfig.errorRate * 100).toFixed(0)}%`);
  res.json({
    message: 'Chaos successfully injected',
    config: chaosConfig
  });
});

app.post('/api/chaos/reset', (req, res) => {
  chaosConfig.extraLatencyMs = 0;
  chaosConfig.errorRate = 0.0;
  console.log('[Chaos Admin] Reset chaos settings. Service is running healthy.');
  res.json({
    message: 'Chaos settings reset. System running healthy.',
    config: chaosConfig
  });
});

app.get('/api/chaos/status', (req, res) => {
  res.json({
    config: chaosConfig,
    autoChaosEnabled: process.env.AUTO_CHAOS === 'true'
  });
});

app.post('/api/chaos/alert-log', (req, res) => {
  const alerts = req.body.alerts || [];
  console.log(`\n🚨 [ALERT SYSTEM INTERCEPT] Alertmanager dispatched ${alerts.length} notification(s)!`);
  alerts.forEach(alert => {
    const name = alert.labels.alertname;
    const status = alert.status.toUpperCase();
    const severity = alert.labels.severity;
    const summary = alert.annotations.summary;
    const description = alert.annotations.description;
    
    console.log(`   [${status}] Alert: "${name}" (${severity}) | Summary: ${summary}`);
    console.log(`Description: ${description}`)
  });
  console.log(``);
  res.json({ message: 'Alert notification printed successfully' });
});

// --- Prometheus Metrics Exposing Endpoint ---
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// --- Optional Automated Chaos Cycle Scheduler ---
if (process.env.AUTO_CHAOS === 'true') {
  console.log('[Chaos Manager] Automated Chaos scheduling is ENABLED.');
  
  const phases = [
    { name: 'Phase 1: Healthy', latency: 0, errorRate: 0.0, durationMs: 120000 },
    { name: 'Phase 2: High Latency Spikes', latency: 1500, errorRate: 0.0, durationMs: 60000 },
    { name: 'Phase 3: Service Outage / Errors', latency: 0, errorRate: 0.5, durationMs: 60000 },
    { name: 'Phase 4: Combined Saturation & Failures', latency: 2500, errorRate: 0.7, durationMs: 60000 },
    { name: 'Phase 5: Recovery', latency: 0, errorRate: 0.0, durationMs: 60000 }
  ];

  let currentPhaseIndex = 0;

  function runChaosCycle() {
    const phase = phases[currentPhaseIndex];
    chaosConfig.extraLatencyMs = phase.latency;
    chaosConfig.errorRate = phase.errorRate;

    console.log(`\n==================================================`);
    console.log(`[Chaos Scheduler] Transitioned to: ${phase.name}`);
    console.log(`[Chaos Scheduler] Current Settings: Latency=${phase.latency}ms, ErrorRate=${(phase.errorRate * 100).toFixed(0)}%`);
    console.log(`==================================================\n`);

    setTimeout(() => {
      currentPhaseIndex = (currentPhaseIndex + 1) % phases.length;
      runChaosCycle();
    }, phase.durationMs);
  }

  // Start the cycle
  runChaosCycle();
}

app.listen(PORT, () => {
  console.log(`[Target Service] Running on port ${PORT}`);
  console.log(`[Target Service] Metrics exposed at http://localhost:${PORT}/metrics`);
});
