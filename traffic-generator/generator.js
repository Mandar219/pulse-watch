const axios = require('axios');

const TARGET_URL = process.env.TARGET_URL || 'http://app:3000/api/v1/resource';
const RPS = parseInt(process.env.RPS || '15', 10);
const LOG_INTERVAL_MS = 5000; // Summarize activity every 5 seconds

console.log(`[Traffic Generator] Started load generator hitting: ${TARGET_URL}`);
console.log(`[Traffic Generator] Configured Rate: ${RPS} Requests Per Second (RPS)`);

// Stats collectors
let successCount = 0;
let failureCount = 0;
let totalLatencyMs = 0;
let intervalRequestsCount = 0;

// Execute a single HTTP GET request
async function sendRequest() {
  const start = process.hrtime();
  intervalRequestsCount++;

  try {
    const response = await axios.get(TARGET_URL, {
      timeout: 10000, // 10s timeout
      validateStatus: () => true // Resolve promise for all status codes
    });

    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e9 + diff[1]) / 1e6;

    totalLatencyMs += durationMs;

    if (response.status >= 200 && response.status < 400) {
      successCount++;
    } else {
      failureCount++;
    }
  } catch (error) {
    // Connection drops, timeouts, network faults
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e9 + diff[1]) / 1e6;
    totalLatencyMs += durationMs;
    failureCount++;
  }
}

// Distribute requests evenly across each second
const intervalMs = Math.floor(1000 / RPS);
setInterval(sendRequest, intervalMs);

// Log aggregated results periodically to keep stdout clean
setInterval(() => {
  const totalCompleted = successCount + failureCount;
  if (totalCompleted === 0) {
    console.log(`[Traffic Generator] Idle (RPS=${RPS}) - waiting to complete first requests...`);
    return;
  }

  const avgLatency = (totalLatencyMs / totalCompleted).toFixed(1);
  const successPercentage = ((successCount / totalCompleted) * 100).toFixed(1);

  console.log(
    `[Traffic Status] Sent: ${totalCompleted} reqs | ` +
    `Success Rate: ${successPercentage}% (${successCount} OK / ${failureCount} Failures) | ` +
    `Average Latency: ${avgLatency}ms | ` +
    `Configured RPS: ${RPS}`
  );

  // Reset counters for the next block
  successCount = 0;
  failureCount = 0;
  totalLatencyMs = 0;
  intervalRequestsCount = 0;
}, LOG_INTERVAL_MS);
