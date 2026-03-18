import "dotenv/config";
import { GeneMap } from "./src/gene-map";
import { PCEC } from "./src/pcec";
import { EnterpriseAgentScenario } from "./src/scenarios/enterprise-agent";

// ── ANSI colors ──────────────────────────────────────────────
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const AMBER  = "\x1b[33m";
const TEAL   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Operation descriptions (for display) ─────────────────────
const OP_SUMMARY: Record<string, (data: Record<string, any>) => string> = {
  ORDER_DISPATCH:   (d) => `${d.assignments} orders assigned`,
  ETA_PREDICTION:   (d) => `${d.predictedETA} · ${d.confidence} conf`,
  CUSTOMER_SUPPORT: (d) => `${d.resolution} · ${d.responseTime}`,
  FRAUD_DETECTION:  (d) => `risk ${d.riskScore} · ${(d.flags?.length ?? 0)} flags`,
  DEMAND_FORECAST:  (d) => `forecast ${d.forecast} · ${d.confidence}`,
  DRIVER_INCENTIVE: (d) => `${d.driversIncentivized} drivers · ${d.totalBudget}`,
};

// ── Business impact estimator ────────────────────────────────
const OP_COST: Record<string, number> = {
  ORDER_DISPATCH:   2500,  // orders not assigned → lost revenue
  ETA_PREDICTION:   800,   // bad ETAs → customer churn
  CUSTOMER_SUPPORT: 1200,  // unresolved complaints → refunds
  FRAUD_DETECTION:  3500,  // missed fraud → chargebacks
  DEMAND_FORECAST:  1800,  // wrong staffing → overtime/lost orders
  DRIVER_INCENTIVE: 600,   // wrong bonuses → driver attrition
};

function header(title: string, subtitle?: string): void {
  const lines = [title];
  if (subtitle) lines.push(subtitle);
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  console.log();
  console.log(`${TEAL}╭${"─".repeat(width)}╮${RESET}`);
  for (const line of lines) {
    console.log(`${TEAL}│${BOLD}  ${line.padEnd(width - 2)}${RESET}${TEAL}│${RESET}`);
  }
  console.log(`${TEAL}╰${"─".repeat(width)}╯${RESET}`);
  console.log();
}

function iterLine(iter: number, op: string, detail: string, latency: number, color: string): void {
  const num = String(iter).padStart(2, " ");
  const opPad = op.padEnd(18);
  const latStr = `${latency}ms`;
  console.log(`  ${color}✓ [iter ${num}]${RESET}  ${opPad} ${color}${detail.padEnd(26)}${RESET} ${DIM}${latStr}${RESET}`);
}

function pcecLog(step: string, detail: string): void {
  console.log(`      ${DIM}${step}${RESET} ${detail}`);
}

// ── PART 1: Without Helix ────────────────────────────────────
async function runWithoutHelix(): Promise<{ completed: number; total: number }> {
  header("PART 1: AI Ops Agent — No Helix", "Simulating: DoorDash-style platform");
  console.log(`  ${DIM}Running 6 AI operations per cycle · real API calls when keys available${RESET}\n`);

  const scenario = new EnterpriseAgentScenario(20);
  let completed = 0;

  for (let i = 1; i <= scenario.totalIterations; i++) {
    try {
      const result = await scenario.agent(i);
      const summary = OP_SUMMARY[result.operation]?.(result.data) ?? "ok";
      iterLine(i, result.operation, summary, result.latencyMs, GREEN);
      completed++;
    } catch (err) {
      const error = err as Error;
      const op = scenario["operations"][(i - 1) % 6]?.name ?? "UNKNOWN";
      console.log(`  ${RED}✗ [iter ${String(i).padStart(2, " ")}]  ${op.padEnd(18)} CRASH: ${error.message}${RESET}`);
      console.log();
      console.log(`${RED}${BOLD}  Agent stopped at iteration ${i}. Required: human intervention.${RESET}`);
      return { completed, total: scenario.totalIterations };
    }
  }

  console.log(`\n  Completed: ${completed}/${scenario.totalIterations}`);
  return { completed, total: scenario.totalIterations };
}

// ── PART 2: With Helix ───────────────────────────────────────
async function runWithHelix(): Promise<{ completed: number; total: number; repairs: number; costPrevented: number }> {
  header("PART 2: AI Ops Agent + Helix SDK", "Same failures. Zero interventions.");
  console.log(`  ${DIM}Running 6 AI operations per cycle · PCEC auto-repair active${RESET}\n`);

  const scenario = new EnterpriseAgentScenario(20);
  const geneMap = new GeneMap();
  const pcec = new PCEC(geneMap, false);

  let completed = 0;
  let repairs = 0;
  let costPrevented = 0;

  for (let i = 1; i <= scenario.totalIterations; i++) {
    try {
      const result = await scenario.agent(i);
      const summary = OP_SUMMARY[result.operation]?.(result.data) ?? "ok";
      iterLine(i, result.operation, summary, result.latencyMs, GREEN);
      completed++;
    } catch (err) {
      const error = err as Error;
      const op = scenario["operations"][(i - 1) % 6]?.name ?? "UNKNOWN";

      // Show business impact
      const cost = OP_COST[op] ?? 1000;
      console.log(`\n  ${AMBER}⚠️  ${op} failed — ${error.message}${RESET}`);

      // Run PCEC
      const perceived = pcec.perceive(error);
      const constructed = pcec.construct(perceived);
      const evaluated = pcec.evaluate(constructed, error);

      pcecLog("🔍 Perceive:", perceived);
      pcecLog("🔧 Construct:", JSON.stringify(constructed));
      pcecLog("⚖️  Evaluate:", `${evaluated} (no history · using default)`);

      // Execute repair strategy
      if (evaluated === "backoff_retry" || evaluated === "retry_with_delay" || evaluated === "retry") {
        const backoffMs = 2000;
        pcecLog("⏳", `backing off ${backoffMs}ms...`);
        await sleep(backoffMs);
      }

      pcec.run("enterprise-agent", error);
      pcecLog("✅ Commit:", "saved to gene map");

      // Retry — should succeed since failure only fires once
      try {
        const retryResult = await scenario.agent(i);
        const summary = OP_SUMMARY[retryResult.operation]?.(retryResult.data) ?? "ok";
        console.log(`  ${TEAL}↺ [iter ${String(i).padStart(2, " ")}]${RESET}  ${op.padEnd(18)} ${TEAL}${summary.padEnd(26)}${RESET} ${DIM}${retryResult.latencyMs}ms${RESET}`);
        completed++;
        repairs++;
        costPrevented += cost;
      } catch (retryErr) {
        console.log(`  ${RED}✗ [iter ${String(i).padStart(2, " ")}]  retry failed: ${(retryErr as Error).message}${RESET}`);
      }
      console.log();
    }
  }

  // Final stats
  const stats = geneMap.getStats();
  geneMap.close();

  return { completed, total: scenario.totalIterations, repairs, costPrevented };
}

// ── Show Map ─────────────────────────────────────────────────
function showMap(): void {
  const geneMap = new GeneMap();
  const repairs = geneMap.getRepairs();
  geneMap.close();

  if (repairs.length === 0) {
    console.log(`\n${DIM}Gene Map is empty. Run the demo first.${RESET}\n`);
    return;
  }

  const rows = repairs.map((r) => ({
    id: r.id,
    errorType: r.errorType,
    strategy: r.repairStrategy,
    timestamp: r.createdAt.replace("T", " ").replace(/\.\d+Z$/, ""),
  }));

  const colW = {
    id:    Math.max(4,  ...rows.map((r) => r.id.length + 2)),
    err:   Math.max(14, ...rows.map((r) => r.errorType.length + 2)),
    strat: Math.max(15, ...rows.map((r) => r.strategy.length + 2)),
    ts:    21,
  };
  const totalW = colW.id + colW.err + colW.strat + colW.ts + 3;

  const pad = (s: string, w: number) => " " + s.padEnd(w - 1);
  const padR = (s: string, w: number) => s.padStart(w - 1) + " ";
  const hdr = (s: string, w: number) => {
    const trimmed = s.length > w ? s.slice(0, w) : s;
    const left = Math.floor((w - trimmed.length) / 2);
    return trimmed.padStart(left + trimmed.length).padEnd(w);
  };

  console.log();
  console.log(`${TEAL}╭${"─".repeat(totalW)}╮${RESET}`);
  console.log(`${TEAL}│${BOLD}  Gene Map — stored repairs${RESET}${" ".repeat(totalW - 27)}${TEAL}│${RESET}`);
  console.log(`${TEAL}├${"─".repeat(colW.id)}┬${"─".repeat(colW.err)}┬${"─".repeat(colW.strat)}┬${"─".repeat(colW.ts)}┤${RESET}`);
  console.log(
    `${TEAL}│${BOLD}${hdr("ID", colW.id)}${RESET}${TEAL}│${BOLD}${hdr("Error Type", colW.err)}${RESET}${TEAL}│${BOLD}${hdr("Strategy", colW.strat)}${RESET}${TEAL}│${BOLD}${hdr("Timestamp", colW.ts)}${RESET}${TEAL}│${RESET}`
  );
  console.log(`${TEAL}├${"─".repeat(colW.id)}┼${"─".repeat(colW.err)}┼${"─".repeat(colW.strat)}┼${"─".repeat(colW.ts)}┤${RESET}`);

  for (const row of rows) {
    console.log(
      `${TEAL}│${RESET}${padR(row.id, colW.id)}${TEAL}│${RESET}${pad(row.errorType, colW.err)}${TEAL}│${RESET}${pad(row.strategy, colW.strat)}${TEAL}│${RESET}${pad(row.timestamp, colW.ts)}${TEAL}│${RESET}`
    );
  }

  console.log(`${TEAL}╰${"─".repeat(colW.id)}┴${"─".repeat(colW.err)}┴${"─".repeat(colW.strat)}┴${"─".repeat(colW.ts)}╯${RESET}`);
  console.log();
}

// ── Summary Box ──────────────────────────────────────────────
function printSummary(
  p1: { completed: number; total: number },
  p2: { completed: number; total: number; repairs: number; costPrevented: number }
): void {
  const w = 50;
  console.log();
  console.log(`${TEAL}╭${"─".repeat(w)}╮${RESET}`);
  console.log(`${TEAL}│${BOLD}  Summary${RESET}${" ".repeat(w - 9)}${TEAL}│${RESET}`);
  console.log(`${TEAL}├${"─".repeat(w)}┤${RESET}`);
  console.log(`${TEAL}│${RESET}  Operations completed    ${RED}${BOLD}${String(p1.completed).padStart(2)}${RESET} / ${p1.total}${" ".repeat(w - 34)}${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Human interventions      ${RED}${BOLD}1${RESET}   (without Helix)${" ".repeat(w - 44)}${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Auto-repairs             ${DIM}0${RESET}   (without Helix)${" ".repeat(w - 44)}${TEAL}│${RESET}`);
  console.log(`${TEAL}├${"─".repeat(w)}┤${RESET}`);
  console.log(`${TEAL}│${RESET}  Operations completed    ${GREEN}${BOLD}${String(p2.completed).padStart(2)}${RESET} / ${p2.total}${" ".repeat(w - 34)}${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Human interventions      ${GREEN}${BOLD}0${RESET}   (with Helix)${" ".repeat(w - 41)}${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Auto-repairs             ${AMBER}${BOLD}${p2.repairs}${RESET}   (with Helix)${" ".repeat(w - 41)}${TEAL}│${RESET}`);
  const costStr = `~$${p2.costPrevented.toLocaleString()} est.`;
  console.log(`${TEAL}│${RESET}  ${AMBER}Business impact saved:  ${costStr}${RESET}${" ".repeat(Math.max(0, w - 26 - costStr.length))}${TEAL}│${RESET}`);
  console.log(`${TEAL}╰${"─".repeat(w)}╯${RESET}`);
}

// ── Main ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (process.argv.includes("--show-map")) {
    showMap();
    return;
  }

  console.log(`\n${DIM}helix v0.1.0 — github.com/CarbonSiliconAI/helix-sdk${RESET}`);
  console.log(`${BOLD}${TEAL}@helix/sdk${RESET} ${DIM}— enterprise AI ops demo${RESET}`);

  const p1 = await runWithoutHelix();
  await sleep(500);
  const p2 = await runWithHelix();

  printSummary(p1, p2);
  console.log();
}

main();
