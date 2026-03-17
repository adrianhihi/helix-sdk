const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SOURCES = ["CoinGecko", "Dune Analytics", "DefiLlama", "Alchemy", "Monad RPC"];

interface InjectedFailure {
  iteration: number;
  name: string;
  message: string;
}

const INJECTED_FAILURES: InjectedFailure[] = [
  { iteration: 8, name: "RateLimitError", message: "429 Too Many Requests — CoinGecko" },
  { iteration: 15, name: "HttpError", message: "503 Service Unavailable — Dune Analytics" },
  { iteration: 23, name: "TimeoutError", message: "Request timeout after 30s — Alchemy RPC" },
  { iteration: 31, name: "AuthError", message: "API key expired — Anthropic" },
];

export class CryptoDataScenario {
  totalIterations: number;
  agent: (iteration: number) => Promise<{ source: string; tvlDelta: number; timestamp: number }>;

  private firedFailures: Set<number> = new Set();

  constructor(totalIterations: number = 40) {
    this.totalIterations = totalIterations;

    this.agent = async (iteration: number) => {
      // Check for injected failure — only fires once per iteration
      // so the retry after PCEC repair succeeds (simulates transient failure)
      const failure = INJECTED_FAILURES.find((f) => f.iteration === iteration);
      if (failure && !this.firedFailures.has(iteration)) {
        this.firedFailures.add(iteration);
        const err = new Error(failure.message);
        err.name = failure.name;
        throw err;
      }

      // Normal agent work
      const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
      await sleep(50);
      const tvlDelta = (Math.random() * 4 - 2); // ±2%
      return { source, tvlDelta, timestamp: Date.now() };
    };
  }

  /** Reset fired failures so the scenario can be rerun cleanly */
  reset(): void {
    this.firedFailures.clear();
  }
}
