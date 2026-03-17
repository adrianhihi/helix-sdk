import { PCECResult } from "./types";
import { GeneMap } from "./gene-map";

const STRATEGY_MAP: Record<string, string[]> = {
  RATE_LIMIT:       ["backoff_retry", "rotate_api_key", "reduce_batch_size"],
  HTTP_503:         ["switch_endpoint", "retry_with_delay", "use_cache"],
  TIMEOUT:          ["increase_timeout", "retry", "switch_endpoint"],
  AUTH_EXPIRED:     ["rotate_credentials", "refresh_token"],
  CONTEXT_OVERFLOW: ["chunk_input", "summarize_context"],
  JSON_PARSE:       ["repair_json", "extract_partial"],
  UNKNOWN:          ["retry", "log_and_skip"],
};

export class PCEC {
  private geneMap: GeneMap;
  private verbose: boolean;

  constructor(geneMap: GeneMap, verbose: boolean) {
    this.geneMap = geneMap;
    this.verbose = verbose;
  }

  /**
   * Perceive — detect and classify the error.
   */
  perceive(error: Error): string {
    const msg = `${error.name ?? ""} ${error.message}`.toLowerCase();

    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
      return "RATE_LIMIT";
    }
    if (msg.includes("503") || msg.includes("service unavailable")) {
      return "HTTP_503";
    }
    if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
      return "TIMEOUT";
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("auth") || msg.includes("expired") || msg.includes("unauthorized")) {
      return "AUTH_EXPIRED";
    }
    if (msg.includes("context") && (msg.includes("overflow") || msg.includes("too long") || msg.includes("max"))) {
      return "CONTEXT_OVERFLOW";
    }
    if (msg.includes("json") || msg.includes("unexpected token") || msg.includes("parse")) {
      return "JSON_PARSE";
    }
    return "UNKNOWN";
  }

  /**
   * Construct — build candidate repair strategies.
   */
  construct(errorType: string): string[] {
    return STRATEGY_MAP[errorType] ?? STRATEGY_MAP["UNKNOWN"];
  }

  /**
   * Evaluate — score and select the best repair strategy.
   */
  evaluate(strategies: string[], _error: Error): string {
    return strategies[0] ?? "no-op";
  }

  /**
   * Commit — save the repair record and return the PCEC result.
   */
  commit(agentId: string, error: Error, strategy: string, durationMs: number): PCECResult {
    const errorType = this.perceive(error);

    this.geneMap.saveRepair({
      id: "",
      agentId,
      errorType,
      errorMessage: error.message,
      repairStrategy: strategy,
      success: true,
      durationMs,
      createdAt: new Date().toISOString(),
    });

    return {
      perceived: errorType,
      constructed: this.construct(errorType),
      evaluated: strategy,
      committed: true,
    };
  }

  /**
   * Run the full PCEC cycle for a given error.
   */
  run(agentId: string, error: Error): PCECResult {
    const start = Date.now();

    const perceived = this.perceive(error);
    if (this.verbose) console.log(`🔍 Perceive: ${perceived}`);

    const constructed = this.construct(perceived);
    if (this.verbose) console.log(`🔧 Construct: ${JSON.stringify(constructed)}`);

    const evaluated = this.evaluate(constructed, error);
    if (this.verbose) console.log(`⚖️  Evaluate: ${evaluated}`);

    const durationMs = Date.now() - start;
    const result = this.commit(agentId, error, evaluated, durationMs);
    if (this.verbose) console.log(`✅ Commit: saved to gene map (${durationMs}ms)`);

    return result;
  }
}
