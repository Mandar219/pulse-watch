# Automated Observability Stack & Chaos Injection Pipeline

This project implements a fully dockerized, high-resolution observability stack designed for sub-5 second detection of service degradations and **Multi-Window Multi-Burn-Rate SLO Alerting**.

It features a **Traffic Generator** that fires steady requests at a configurable rate, coupled with a target microservice featuring **Chaos Fault Injection Middleware** and an auto-looping chaos scheduler.

---

## 🚀 Quick Start

Launch the entire stack with a single command:

```bash
docker-compose up --build
```

Once running, the following services will be active on your host machine:

| Service | Port | URL | Description |
| :--- | :--- | :--- | :--- |
| **Grafana** | `3001` | [http://localhost:3001](http://localhost:3001) | **SRE Dashboard**. Visualizes the 4 Golden Signals and active SLO budgets. |
| **Target Service** | `3000` | [http://localhost:3000](http://localhost:3000) | Express microservice hosting the live `/api/v1/resource` endpoint. |
| **Prometheus** | `9090` | [http://localhost:9090](http://localhost:9090) | Time-series query interface. |
| **Alertmanager** | `9093` | [http://localhost:9093](http://localhost:9093) | Alert routing panel. |

---

## 📈 Configuring Traffic Rate (RPS)

You can easily adjust the traffic rate sent to the API.
1. Open the `docker-compose.yml` file.
2. Edit the `RPS` environment variable under the `traffic-generator` block:
   ```yaml
   traffic-generator:
     environment:
       - RPS=25 # Set to any integer (e.g. 5, 20, 50, etc.)
   ```
3. Apply the changes by running:
   ```bash
   docker-compose up -d traffic-generator
   ```

---

## ⚡ Chaos Engineering & SLO Verification

By default, `AUTO_CHAOS=true` is enabled in `docker-compose.yml`. The target service will **automatically transition** through 5 distinct operational phases every few minutes:

1. **Phase 1: Healthy** (0ms delay, 0% errors) — All metrics green.
2. **Phase 2: High Latency Spikes** (+1500ms latency) — Violates Latency SLO.
3. **Phase 3: Service Outage / Errors** (50% error rate) — Violates Availability SLO.
4. **Phase 4: Combined Saturation & Failures** (+2500ms latency, 70% error rate) — Critical burn-rate active.
5. **Phase 5: Recovery** (0ms delay, 0% errors) — Alerts resolve automatically.

### 🎮 Manual Chaos Control

To test the SLO alerts manually, change `AUTO_CHAOS=false` in `docker-compose.yml` and restart the stack. You can then inject chaos using simple `curl` commands:

#### 1. Check Current Chaos Status
```bash
curl http://localhost:3000/api/chaos/status
```

#### 2. Inject Latency Spike
Adds an extra 2.5-second processing delay:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"latency": 2500}' \
  http://localhost:3000/api/chaos/inject
```

#### 3. Inject High Error Rates
Forces 40% of requests to fail with a `500 Internal Server Error`:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"errorRate": 0.40}' \
  http://localhost:3000/api/chaos/inject
```

#### 4. Combined Failure
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"latency": 2000, "errorRate": 0.50}' \
  http://localhost:3000/api/chaos/inject
```

#### 5. Reset to Healthy
```bash
curl -X POST http://localhost:3000/api/chaos/reset
```

---

## Closed-Loop Alert Interceptor

This stack implements a **closed-loop feedback system**:
1. When **Prometheus** triggers an alert rule, it routes it to **Alertmanager**.
2. **Alertmanager** dispatches a webhook directly back to the **Target Service** endpoint `/api/chaos/alert-log`.
3. The Target Service prints the incoming alert details directly in its own standard log output!

Watch your terminal. When an alert fires, you will see a high-visibility intercept message appear directly in the `docker-compose` output:

```text
🚨 [ALERT SYSTEM INTERCEPT] Alertmanager dispatched 1 notification(s)!
   [FIRING] Alert: "InstantAvailabilityDegradation" (page) | Summary: Instantaneous Availability Drop (Sub-5s Detection)
```

---

## 📊 Grafana Dashboard Layout

Open [http://localhost:3001](http://localhost:3001) to view the pre-provisioned dashboard:
* **Stat Blocks**: Instant rolling availability, p90 response latency, concurrent active requests, and node CPU metrics.
* **Latency Timeline**: Rolling p50, p90, and p99 request latency charted against the SRE 200ms SLO limit.
* **Traffic RPS**: Requests per second stacked by status code.
* **Error Rate Timeline**: Dynamic error percentage mapped against the SRE 0.5% budget limit.
* **Saturation**: Event Loop Lag (Node thread blocking indicators), Host CPU footprint, and RSS memory usage.
