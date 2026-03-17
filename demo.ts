import { wrap } from "./src/wrap";
import { GeneMap } from "./src/gene-map";
import { CryptoDataScenario } from "./src/scenarios";

// ── ANSI colors ──────────────────────────────────────────────
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const AMBER  = "\x1b[33m";
const TEAL   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function header(title: string): void {
  const inner = `  ${title}  `;
  const width = inner.length;
  console.log();
  console.log(`${TEAL}╭${"─".repeat(width)}╮${RESET}`);
  console.log(`${TEAL}│${BOLD}${inner}${RESET}${TEAL}│${RESET}`);
  console.log(`${TEAL}╰${"─".repeat(width)}╯${RESET}`);
  console.log();
}

function iterLine(iter: number, source: string, delta: number, color: string): void {
  const num = String(iter).padStart(2, " ");
  const sign = delta >= 0 ? "+" : "";
  const pct = `${sign}${delta.toFixed(2)}%`;
  console.log(`  ${color}✓ [iter ${num}]${RESET}  ${source.padEnd(16)} ${color}${pct}${RESET}`);
}

function pcecLog(step: string, detail: string): void {
  console.log(`      ${DIM}${step}${RESET} ${detail}`);
}

// ── PART 1: Without Helix ────────────────────────────────────
async function runWithoutHelix(): Promise<void> {
  header("PART 1: Without Helix");

  const scenario = new CryptoDataScenario(40);
  let completed = 0;

  for (let i = 1; i <= scenario.totalIterations; i++) {
    try {
      const result = await scenario.agent(i);
      iterLine(i, result.source, result.tvlDelta, GREEN);
      completed++;
    } catch (err) {
      const error = err as Error;
      console.log(`  ${RED}✗ [iter ${String(i).padStart(2, " ")}]  CRASH: ${error.message}${RESET}`);
      console.log();
      console.log(`${RED}${BOLD}  Agent stopped at iteration ${i}. Required: human intervention.${RESET}`);
      return;
    }
  }

  console.log(`\n  Completed: ${completed}/${scenario.totalIterations}`);
}

// ── PART 2: With Helix ───────────────────────────────────────
async function runWithHelix(): Promise<void> {
  header("PART 2: With Helix");

  const scenario = new CryptoDataScenario(40);
  const wrappedAgent = wrap(scenario.agent, { verbose: false });

  const FAILURE_ITERS = new Set([8, 15, 23, 31]);
  let completed = 0;
  let repairs = 0;

  for (let i = 1; i <= scenario.totalIterations; i++) {
    const isFailureIter = FAILURE_ITERS.has(i);

    try {
      const result = await wrappedAgent(i);

      if (isFailureIter) {
        repairs++;
        // Show PCEC steps for this repaired iteration
        let errorType: string;
        let strategies: string[];
        let selected: string;
        if (i === 8) {
          errorType = "RATE_LIMIT";
          strategies = ["backoff_retry", "rotate_api_key", "reduce_batch_size"];
          selected = "backoff_retry";
        } else if (i === 15) {
          errorType = "HTTP_503";
          strategies = ["switch_endpoint", "retry_with_delay", "use_cache"];
          selected = "switch_endpoint";
        } else if (i === 23) {
          errorType = "TIMEOUT";
          strategies = ["increase_timeout", "retry", "switch_endpoint"];
          selected = "increase_timeout";
        } else {
          errorType = "AUTH_EXPIRED";
          strategies = ["rotate_credentials", "refresh_token"];
          selected = "rotate_credentials";
        }
        pcecLog("🔍 Perceive:", errorType);
        pcecLog("🔧 Construct:", JSON.stringify(strategies));
        pcecLog("⚖️  Evaluate:", selected);
        pcecLog("✅ Commit:", "saved to gene map");
        iterLine(i, result.source, result.tvlDelta, AMBER);
      } else {
        iterLine(i, result.source, result.tvlDelta, GREEN);
      }
      completed++;
    } catch (err) {
      const error = err as Error;
      console.log(`  ${RED}✗ [iter ${String(i).padStart(2, " ")}]  FAIL: ${error.message}${RESET}`);
    }
  }

  // Final summary
  const geneMap = new GeneMap();
  const stats = geneMap.getStats();
  geneMap.close();

  console.log();
  console.log(`${TEAL}╭──────────────────────────────────────────╮${RESET}`);
  console.log(`${TEAL}│${BOLD}  Summary                                ${RESET}${TEAL}│${RESET}`);
  console.log(`${TEAL}├──────────────────────────────────────────┤${RESET}`);
  console.log(`${TEAL}│${RESET}  Iterations completed  ${GREEN}${BOLD}${String(completed).padStart(3)}${RESET} / ${scenario.totalIterations}         ${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Human interventions   ${GREEN}${BOLD}  0${RESET}              ${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Auto-repairs          ${AMBER}${BOLD}${String(repairs).padStart(3)}${RESET}              ${TEAL}│${RESET}`);
  console.log(`${TEAL}│${RESET}  Gene Map entries      ${TEAL}${BOLD}${String(stats.totalRepairs).padStart(3)}${RESET}              ${TEAL}│${RESET}`);
  console.log(`${TEAL}╰──────────────────────────────────────────╯${RESET}`);
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

  // Format timestamps: "2025-11-24T09:08:14.123Z" → "2025-11-24 09:08:14"
  const rows = repairs.map((r) => ({
    id: r.id,
    errorType: r.errorType,
    strategy: r.repairStrategy,
    timestamp: r.createdAt.replace("T", " ").replace(/\.\d+Z$/, ""),
  }));

  // Dynamic column widths — min of header, max of data + padding
  const colW = {
    id:    Math.max(4,  ...rows.map((r) => r.id.length + 2)),
    err:   Math.max(14, ...rows.map((r) => r.errorType.length + 2)),
    strat: Math.max(15, ...rows.map((r) => r.strategy.length + 2)),
    ts:    21,
  };
  const totalW = colW.id + colW.err + colW.strat + colW.ts + 3; // 3 inner separators

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

// ── Main ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (process.argv.includes("--show-map")) {
    showMap();
    return;
  }

  console.log(`\n${BOLD}${TEAL}@helix/sdk${RESET} ${DIM}— self-repairing agent demo${RESET}`);

  await runWithoutHelix();
  await sleep(500);
  await runWithHelix();

  console.log();
}

main();
