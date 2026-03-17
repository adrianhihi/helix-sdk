import express from "express";
import cors from "cors";
import path from "path";
import { GeneMap } from "./gene-map";
import { PCEC } from "./pcec";
import { CryptoDataScenario } from "./scenarios";
import { LiveCryptoScenario } from "./scenarios/live-crypto";

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

  send({ type: "start", mode: mode === "live" ? "live" : "simulated" });

  // ── Live mode ──────────────────────────────────────────────
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

        // Retry with exponential backoff
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

  // ── Part 1: Without Helix ──────────────────────────────────
  const scenario1 = new CryptoDataScenario(40);
  send({ type: "part", part: 1, label: "Without Helix" });

  let part1Completed = 0;
  for (let i = 1; i <= scenario1.totalIterations; i++) {
    if (clientDisconnected) break;
    try {
      const result = await scenario1.agent(i);
      const delta = (result.tvlDelta >= 0 ? "+" : "") + result.tvlDelta.toFixed(2) + "%";
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

  // ── Part 2: With Helix ─────────────────────────────────────
  if (clientDisconnected) { geneMap.close(); res.end(); return; }

  const scenario2 = new CryptoDataScenario(40);
  send({ type: "part", part: 2, label: "With Helix" });

  const FAILURE_ITERS = new Set([8, 15, 23, 31]);
  let part2Completed = 0;
  let autoRepairs = 0;

  for (let i = 1; i <= scenario2.totalIterations; i++) {
    if (clientDisconnected) break;

    try {
      const result = await scenario2.agent(i);
      const delta = (result.tvlDelta >= 0 ? "+" : "") + result.tvlDelta.toFixed(2) + "%";
      part2Completed++;
      send({ type: "iter", part: 2, iter: i, source: result.source, delta, status: "ok" });
    } catch (err) {
      const error = err as Error;

      // Run PCEC — emit each step with delay
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

      // Retry — should succeed since failure only fires once
      try {
        const retryResult = await scenario2.agent(i);
        const delta = (retryResult.tvlDelta >= 0 ? "+" : "") + retryResult.tvlDelta.toFixed(2) + "%";
        part2Completed++;
        send({ type: "iter", part: 2, iter: i, source: retryResult.source, delta, status: "repaired" });
      } catch (retryErr) {
        send({ type: "iter", part: 2, iter: i, source: "", delta: "", status: "crash" });
      }
    }
    await sleep(120);
  }

  send({ type: "part_summary", part: 2, completed: part2Completed, total: scenario2.totalIterations, humanInterventions: 0, autoRepairs });

  // Send gene map
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

app.listen(PORT, () => {
  console.log(`\n  🧬 Helix Dashboard → http://localhost:${PORT}\n`);
});
