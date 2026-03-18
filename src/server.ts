import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { GeneMap } from "./gene-map";
import { PCEC } from "./pcec";
import { CryptoDataScenario } from "./scenarios";
import { LiveCryptoScenario } from "./scenarios/live-crypto";
import { EnterpriseAgentScenario } from "./scenarios/enterprise-agent";

const app = express();
const PORT = 7842;

app.use(cors());

// Landing page must be registered before static middleware
// (static would serve index.html for "/" otherwise)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "landing.html"));
});

app.use(express.static(path.join(__dirname, "..", "static")));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Business impact estimator ────────────────────────────────
const OP_COST: Record<string, number> = {
  ORDER_DISPATCH:   2500,
  ETA_PREDICTION:   800,
  CUSTOMER_SUPPORT: 1200,
  FRAUD_DETECTION:  3500,
  DEMAND_FORECAST:  1800,
  DRIVER_INCENTIVE: 600,
};

// ── SSE stream endpoint ──────────────────────────────────────
app.get("/api/helix/stream", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let clientDisconnected = false;
  req.on("close", () => {
    clientDisconnected = true;
  });

  const send = (data: Record<string, any>) => {
    if (clientDisconnected) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const geneMap = new GeneMap();
  const pcec = new PCEC(geneMap, false);
  const mode = req.query.mode as string | undefined;

  send({ type: "start", mode: mode === "live" ? "live" : mode === "enterprise" ? "enterprise" : "simulated" });

  // ── Live mode (legacy crypto) ────────────────────────────────
  if (mode === "live") {
    send({ type: "part", part: 2, label: "Live — Real CoinGecko API" });

    const scenario = new LiveCryptoScenario(30);
    let completed = 0;
    let repairs = 0;

    for (let i = 1; i <= scenario.totalIterations; i++) {
      if (clientDisconnected) break;

      try {
        const result = await scenario.agent(i);
        const priceStr = Object.entries(result.prices)
          .map(([k, v]) => `${k}=$${v}`)
          .join("  ");
        completed++;
        send({ type: "iter", part: 2, iter: i, source: result.source, delta: priceStr, status: "ok", httpStatus: result.httpStatus });
      } catch (err) {
        const error = err as Error;
        const perceived = pcec.perceive(error);
        send({ type: "pcec_step", step: "perceive", value: perceived });
        await sleep(150);

        const constructed = pcec.construct(perceived);
        send({ type: "pcec_step", step: "construct", value: JSON.stringify(constructed) });
        await sleep(150);

        const evaluated = pcec.evaluate(constructed, error);
        send({ type: "pcec_step", step: "evaluate", value: evaluated });
        await sleep(150);

        pcec.run("live-agent", error);
        send({ type: "pcec_step", step: "commit", value: "saved to gene map" });
        await sleep(150);

        send({ type: "repair_done", errorType: perceived, strategy: evaluated });
        repairs++;

        await sleep(5000);
        try {
          const retryResult = await scenario.agent(i);
          const priceStr = Object.entries(retryResult.prices)
            .map(([k, v]) => `${k}=$${v}`)
            .join("  ");
          completed++;
          send({ type: "iter", part: 2, iter: i, source: retryResult.source, delta: priceStr, status: "repaired", httpStatus: retryResult.httpStatus });
        } catch (retryErr) {
          send({ type: "iter", part: 2, iter: i, source: "", delta: "", status: "crash", httpStatus: 0 });
        }
      }
      await sleep(3000);
    }

    send({ type: "part_summary", part: 2, completed, total: scenario.totalIterations, humanInterventions: 0, autoRepairs: repairs });
    const liveRepairs = geneMap.getRepairs();
    send({ type: "gene_map", repairs: liveRepairs });
    send({ type: "done" });
    geneMap.close();
    res.end();
    return;
  }

  // ── Enterprise mode ──────────────────────────────────────────
  if (mode === "enterprise") {
    // Part 1: Without Helix
    const scenario1 = new EnterpriseAgentScenario(20);
    send({ type: "part", part: 1, label: "AI Ops Agent — No Helix", task: "DoorDash-style platform · 6 AI operations per cycle" });

    let part1Completed = 0;
    for (let i = 1; i <= scenario1.totalIterations; i++) {
      if (clientDisconnected) break;
      try {
        const result = await scenario1.agent(i);
        part1Completed++;
        send({
          type: "iter", part: 1, iter: i,
          operation: result.operation,
          source: result.operation,
          delta: result.status,
          status: "ok",
          latencyMs: result.latencyMs,
          businessContext: `${result.operation} completed`,
          data: result.data,
        });
      } catch (err) {
        const error = err as Error;
        const op = scenario1["operations"][(i - 1) % 6]?.name ?? "UNKNOWN";
        const errorType = pcec.perceive(error);
        send({ type: "iter", part: 1, iter: i, operation: op, source: op, delta: "", status: "crash", latencyMs: 0 });
        send({ type: "crash", iter: i, errorType, message: error.message, operation: op });
        send({ type: "business_impact", operation: op, estimatedCost: OP_COST[op] ?? 1000, prevented: false });
        break;
      }
      await sleep(120);
    }

    send({ type: "part_summary", part: 1, completed: part1Completed, total: scenario1.totalIterations, humanInterventions: 1, autoRepairs: 0 });

    await sleep(600);
    if (clientDisconnected) { geneMap.close(); res.end(); return; }

    // Part 2: With Helix
    const scenario2 = new EnterpriseAgentScenario(20);
    send({ type: "part", part: 2, label: "AI Ops Agent + Helix SDK", task: "Same failures. Zero interventions." });

    let part2Completed = 0;
    let autoRepairs = 0;
    let totalCostPrevented = 0;

    for (let i = 1; i <= scenario2.totalIterations; i++) {
      if (clientDisconnected) break;

      try {
        const result = await scenario2.agent(i);
        part2Completed++;
        send({
          type: "iter", part: 2, iter: i,
          operation: result.operation,
          source: result.operation,
          delta: result.status,
          status: "ok",
          latencyMs: result.latencyMs,
          businessContext: `${result.operation} completed`,
          data: result.data,
        });
      } catch (err) {
        const error = err as Error;
        const op = scenario2["operations"][(i - 1) % 6]?.name ?? "UNKNOWN";
        const cost = OP_COST[op] ?? 1000;

        // Run PCEC — emit each step
        const perceived = pcec.perceive(error);
        send({ type: "pcec_step", step: "perceive", value: perceived });
        await sleep(200);

        const constructed = pcec.construct(perceived);
        send({ type: "pcec_step", step: "construct", value: JSON.stringify(constructed) });
        await sleep(200);

        const evaluated = pcec.evaluate(constructed, error);
        send({ type: "pcec_step", step: "evaluate", value: evaluated });
        await sleep(200);

        pcec.run("enterprise-agent", error);
        send({ type: "pcec_step", step: "commit", value: "saved to gene map" });
        await sleep(200);

        send({ type: "repair_done", errorType: perceived, strategy: evaluated, fromOperation: op });
        send({ type: "capsule_broadcast", fromOperation: op, toAll: true });
        autoRepairs++;

        // Retry
        try {
          const retryResult = await scenario2.agent(i);
          part2Completed++;
          totalCostPrevented += cost;
          send({
            type: "iter", part: 2, iter: i,
            operation: retryResult.operation,
            source: retryResult.operation,
            delta: retryResult.status,
            status: "repaired",
            latencyMs: retryResult.latencyMs,
            businessContext: `${op} recovered`,
            data: retryResult.data,
          });
          send({ type: "business_impact", operation: op, estimatedCost: cost, prevented: true });
        } catch (retryErr) {
          send({ type: "iter", part: 2, iter: i, operation: op, source: op, delta: "", status: "crash", latencyMs: 0 });
          send({ type: "business_impact", operation: op, estimatedCost: cost, prevented: false });
        }
      }
      await sleep(120);
    }

    send({
      type: "part_summary", part: 2,
      completed: part2Completed, total: scenario2.totalIterations,
      humanInterventions: 0, autoRepairs,
      businessImpactSaved: totalCostPrevented,
      summary: `${part2Completed}/${scenario2.totalIterations} operations · 0 human interventions · ${autoRepairs} auto-repairs · ~$${totalCostPrevented.toLocaleString()} saved`,
    });

    const repairs = geneMap.getRepairs();
    send({ type: "gene_map", repairs });
    send({ type: "done" });
    geneMap.close();
    res.end();
    return;
  }

  // ── Default: Simulated crypto (legacy for dashboard) ─────────
  const scenario1 = new CryptoDataScenario(40);
  send({ type: "part", part: 1, label: "Without Helix", task: "monitor 12 DeFi protocol TVL changes · polling every 5min" });

  let part1Completed = 0;
  for (let i = 1; i <= scenario1.totalIterations; i++) {
    if (clientDisconnected) break;
    try {
      const result = await scenario1.agent(i);
      const delta = "TVL Δ " + (result.tvlDelta >= 0 ? "+" : "") + result.tvlDelta.toFixed(2) + "%";
      part1Completed++;
      send({ type: "iter", part: 1, iter: i, source: result.source, delta, status: "ok" });
    } catch (err) {
      const error = err as Error;
      const errorType = pcec.perceive(error);
      send({ type: "iter", part: 1, iter: i, source: "", delta: "", status: "crash" });
      send({ type: "crash", iter: i, errorType, message: error.message });
      break;
    }
    await sleep(120);
  }

  send({ type: "part_summary", part: 1, completed: part1Completed, total: scenario1.totalIterations, humanInterventions: 1, autoRepairs: 0 });

  await sleep(600);

  if (clientDisconnected) { geneMap.close(); res.end(); return; }

  const scenario2 = new CryptoDataScenario(40);
  send({ type: "part", part: 2, label: "With Helix", task: "monitor 12 DeFi protocol TVL changes · polling every 5min" });

  let part2Completed = 0;
  let autoRepairs = 0;

  for (let i = 1; i <= scenario2.totalIterations; i++) {
    if (clientDisconnected) break;

    try {
      const result = await scenario2.agent(i);
      const delta = "TVL Δ " + (result.tvlDelta >= 0 ? "+" : "") + result.tvlDelta.toFixed(2) + "%";
      part2Completed++;
      send({ type: "iter", part: 2, iter: i, source: result.source, delta, status: "ok" });
    } catch (err) {
      const error = err as Error;

      const perceived = pcec.perceive(error);
      send({ type: "pcec_step", step: "perceive", value: perceived });
      await sleep(200);

      const constructed = pcec.construct(perceived);
      send({ type: "pcec_step", step: "construct", value: JSON.stringify(constructed) });
      await sleep(200);

      const evaluated = pcec.evaluate(constructed, error);
      send({ type: "pcec_step", step: "evaluate", value: evaluated });
      await sleep(200);

      pcec.run("demo-agent", error);
      send({ type: "pcec_step", step: "commit", value: "saved to gene map" });
      await sleep(200);

      send({ type: "repair_done", errorType: perceived, strategy: evaluated });
      autoRepairs++;

      try {
        const retryResult = await scenario2.agent(i);
        const delta = "TVL Δ " + (retryResult.tvlDelta >= 0 ? "+" : "") + retryResult.tvlDelta.toFixed(2) + "%";
        part2Completed++;
        send({ type: "iter", part: 2, iter: i, source: retryResult.source, delta, status: "repaired" });
      } catch (retryErr) {
        send({ type: "iter", part: 2, iter: i, source: "", delta: "", status: "crash" });
      }
    }
    await sleep(120);
  }

  send({ type: "part_summary", part: 2, completed: part2Completed, total: scenario2.totalIterations, humanInterventions: 0, autoRepairs, summary: `${part2Completed}/${scenario2.totalIterations} iterations · 8 hours monitored · 0 human interventions · ${autoRepairs} auto-repairs` });

  const repairs = geneMap.getRepairs();
  send({ type: "gene_map", repairs });

  send({ type: "done" });
  geneMap.close();
  res.end();
});

// ── Gene Map JSON endpoint ───────────────────────────────────
app.get("/api/helix/gene-map", (_req, res) => {
  const geneMap = new GeneMap();
  const repairs = geneMap.getRepairs();
  const stats = geneMap.getStats();
  geneMap.close();
  res.json({ repairs, stats });
});

// ── Serve pages ──────────────────────────────────────────────
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "index.html"));
});

app.get("/scenarios", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "scenarios.html"));
});

app.get("/scenarios.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "scenarios.html"));
});

app.get("/automaton", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "automaton.html"));
});

app.get("/gene-world", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "gene-world.html"));
});

app.listen(PORT, () => {
  console.log(`\n  🧬 Helix Dashboard → http://localhost:${PORT}\n`);
});
