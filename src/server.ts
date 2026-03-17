import express from "express";
import cors from "cors";
import path from "path";
import { GeneMap } from "./gene-map";
import { PCEC } from "./pcec";
import { CryptoDataScenario } from "./scenarios";

const app = express();
const PORT = 7842;

app.use(cors());
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

  send({ type: "start" });

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

// ── Serve index.html ─────────────────────────────────────────
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "static", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  🧬 Helix Dashboard → http://localhost:${PORT}\n`);
});
