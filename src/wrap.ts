import crypto from "crypto";
import { HelixOptions } from "./types";
import { PCEC } from "./pcec";
import { GeneMap } from "./gene-map";

/**
 * Derive a stable agent ID from the function name, or fall back to a random UUID.
 */
function deriveAgentId(agent: (...args: any[]) => any): string {
  if (agent.name) {
    return crypto.createHash("sha256").update(agent.name).digest("hex").slice(0, 12);
  }
  return crypto.randomUUID();
}

/**
 * Wrap an agent function with Helix self-repair capabilities.
 *
 * Returns a new function with the same signature that intercepts errors
 * and runs them through the PCEC engine.
 */
export function wrap<T extends (...args: any[]) => any>(
  agent: T,
  options?: HelixOptions
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const geneMap = new GeneMap();
  const verbose = options?.verbose ?? false;
  const pcec = new PCEC(geneMap, verbose);
  const agentId = deriveAgentId(agent);

  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      const result = await agent(...args);
      return result;
    } catch (error) {
      if (verbose) {
        console.log(`[helix] Error intercepted: ${(error as Error).message}`);
      }

      const pcecResult = pcec.run(agentId, error as Error);

      if (verbose) {
        console.log("[helix] PCEC result:", pcecResult);
        console.log("[helix] Retrying agent...");
      }

      // Retry the original call once
      try {
        const retryResult = await agent(...args);
        return retryResult;
      } catch (retryError) {
        if (verbose) {
          console.log(`[helix] Retry failed: ${(retryError as Error).message}`);
        }
        throw error;
      }
    }
  };
}
