const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isValidKey(key: string | undefined): key is string {
  if (!key || key === "your_key_here") return false;
  return key.startsWith("sk-") || key.startsWith("sk-ant-");
}

export interface OperationResult {
  operation: string;
  status: "success" | "degraded" | "failed";
  data: Record<string, any>;
  latencyMs: number;
}

interface Operation {
  name: string;
  description: string;
  apiCall: () => Promise<OperationResult>;
}

export class EnterpriseAgentScenario {
  totalIterations = 20;

  private operations: Operation[];
  private firedFailures: Set<string> = new Set();

  constructor(totalIterations: number = 20) {
    this.totalIterations = totalIterations;
    this.operations = [
      this.orderDispatch(),
      this.etaPrediction(),
      this.customerSupport(),
      this.fraudDetection(),
      this.demandForecast(),
      this.driverIncentive(),
    ];
  }

  agent = async (iteration: number): Promise<OperationResult> => {
    const op = this.operations[(iteration - 1) % this.operations.length];
    const start = Date.now();
    const result = await op.apiCall();
    return { ...result, latencyMs: Date.now() - start };
  };

  /** Reset fired failures so the scenario can be rerun cleanly */
  reset(): void {
    this.firedFailures.clear();
  }

  private async callOpenAI(
    prompt: string,
    opts: {
      timeoutMs?: number;
      apiKey?: string;
      forceError?: "rate_limit" | "timeout" | "json_parse" | "503";
    } = {}
  ): Promise<string> {
    if (opts.forceError === "rate_limit") {
      const err = new Error("429 Too Many Requests — OpenAI API");
      err.name = "RateLimitError";
      throw err;
    }
    if (opts.forceError === "timeout") {
      const err = new Error("Request timeout after 30s — OpenAI API");
      err.name = "TimeoutError";
      throw err;
    }
    if (opts.forceError === "503") {
      const err = new Error("503 Service Unavailable — OpenAI API");
      err.name = "HttpError";
      throw err;
    }

    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!isValidKey(apiKey)) {
      // Mock mode — simulate realistic latency and return plausible data
      await sleep(300 + Math.random() * 700);
      return JSON.stringify({ mock: true, result: "simulated" });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? 15000
    );

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
          }),
        }
      );

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const err = new Error("429 Too Many Requests — OpenAI API");
        err.name = "RateLimitError";
        throw err;
      }
      if (response.status === 503) {
        const err = new Error("503 Service Unavailable — OpenAI API");
        err.name = "HttpError";
        throw err;
      }
      if (response.status === 401) {
        const err = new Error("401 Unauthorized — Invalid API key");
        err.name = "AuthError";
        throw err;
      }
      if (!response.ok) {
        throw new Error(`${response.status} — OpenAI API`);
      }

      const data: any = await response.json();
      return data.choices[0].message.content;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        const err = new Error("Request timeout — OpenAI API");
        err.name = "TimeoutError";
        throw err;
      }
      throw e;
    }
  }

  private async callAnthropic(
    prompt: string,
    opts: {
      forceError?: "context_overflow" | "auth";
    } = {}
  ): Promise<string> {
    if (opts.forceError === "context_overflow") {
      const err = new Error("Context length exceeded — Anthropic API");
      err.name = "ContextOverflowError";
      throw err;
    }
    if (opts.forceError === "auth") {
      const err = new Error("401 Unauthorized — Invalid Anthropic API key");
      err.name = "AuthError";
      throw err;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!isValidKey(apiKey)) {
      // Mock mode
      await sleep(300 + Math.random() * 700);
      return JSON.stringify({ mock: true, result: "simulated" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.status === 401) {
      const err = new Error("401 Unauthorized — Anthropic API");
      err.name = "AuthError";
      throw err;
    }
    if (!response.ok) {
      throw new Error(`${response.status} — Anthropic API`);
    }

    const data: any = await response.json();
    return data.content[0].text;
  }

  // ── Failure scheduling ─────────────────────────────────────
  // Each failure fires once; retry succeeds (transient failure sim)
  private shouldFail(key: string, callCount: number, every: number): boolean {
    if (callCount % every === 0 && !this.firedFailures.has(`${key}-${callCount}`)) {
      this.firedFailures.add(`${key}-${callCount}`);
      return true;
    }
    return false;
  }

  // ── Operations ─────────────────────────────────────────────

  private orderDispatch(): Operation {
    let callCount = 0;
    return {
      name: "ORDER_DISPATCH",
      description: "AI optimizes order-to-driver assignment",
      apiCall: async () => {
        callCount++;
        const result = await this.callOpenAI(
          "Assign 3 orders to 5 drivers optimally. Return JSON: " +
            '{assignments: [{orderId, driverId, estimatedPickup}]}',
          {
            forceError: this.shouldFail("dispatch", callCount, 3)
              ? "rate_limit"
              : undefined,
          }
        );
        return {
          operation: "ORDER_DISPATCH",
          status: "success" as const,
          data: { assignments: 3, optimizationMs: 120 },
          latencyMs: 0,
        };
      },
    };
  }

  private etaPrediction(): Operation {
    let callCount = 0;
    return {
      name: "ETA_PREDICTION",
      description: "AI predicts delivery time for active orders",
      apiCall: async () => {
        callCount++;
        const result = await this.callOpenAI(
          "Predict ETA for delivery: 3.2km, moderate traffic. " +
            "Return JSON: {minutes: number, confidence: string}",
          {
            forceError: this.shouldFail("eta", callCount, 4)
              ? "timeout"
              : undefined,
          }
        );
        return {
          operation: "ETA_PREDICTION",
          status: "success" as const,
          data: { predictedETA: "18 min", confidence: "high" },
          latencyMs: 0,
        };
      },
    };
  }

  private customerSupport(): Operation {
    let callCount = 0;
    return {
      name: "CUSTOMER_SUPPORT",
      description: "AI handles customer complaints autonomously",
      apiCall: async () => {
        callCount++;
        const result = await this.callAnthropic(
          "Customer complaint: order 30min late. Draft resolution as JSON.",
          {
            forceError: this.shouldFail("support", callCount, 5)
              ? "context_overflow"
              : undefined,
          }
        );
        return {
          operation: "CUSTOMER_SUPPORT",
          status: "success" as const,
          data: { resolution: "credit_issued", responseTime: "< 1s" },
          latencyMs: 0,
        };
      },
    };
  }

  private fraudDetection(): Operation {
    let callCount = 0;
    return {
      name: "FRAUD_DETECTION",
      description: "AI scores each order for fraud risk in real-time",
      apiCall: async () => {
        callCount++;
        if (this.shouldFail("fraud", callCount, 4)) {
          const err = new Error(
            "JSON parse failed — FRAUD_DETECTION response"
          );
          err.name = "JsonParseError";
          throw err;
        }
        const result = await this.callOpenAI(
          "Score order #4821 for fraud risk 0-100. " +
            "Return ONLY valid JSON: {\"score\": number, \"flags\": []}"
        );
        return {
          operation: "FRAUD_DETECTION",
          status: "success" as const,
          data: { riskScore: 12, flags: [] },
          latencyMs: 0,
        };
      },
    };
  }

  private demandForecast(): Operation {
    let callCount = 0;
    return {
      name: "DEMAND_FORECAST",
      description: "AI predicts order volume for next hour",
      apiCall: async () => {
        callCount++;
        const result = await this.callAnthropic(
          "Predict order volume next hour. Historical avg: 450/hr. " +
            "Current time: dinner rush. Return: {forecast: number}",
          {
            forceError: this.shouldFail("demand", callCount, 5)
              ? "auth"
              : undefined,
          }
        );
        return {
          operation: "DEMAND_FORECAST",
          status: "success" as const,
          data: { forecast: 612, confidence: "87%" },
          latencyMs: 0,
        };
      },
    };
  }

  private driverIncentive(): Operation {
    let callCount = 0;
    return {
      name: "DRIVER_INCENTIVE",
      description: "AI calculates optimal driver bonuses",
      apiCall: async () => {
        callCount++;
        const result = await this.callOpenAI(
          "Calculate bonuses for 10 drivers based on: " +
            "deliveries completed, ratings, peak hour coverage. " +
            "Return JSON array of {driverId, bonus}.",
          {
            forceError: this.shouldFail("incentive", callCount, 4)
              ? "503"
              : undefined,
          }
        );
        return {
          operation: "DRIVER_INCENTIVE",
          status: "success" as const,
          data: { driversIncentivized: 10, totalBudget: "$340" },
          latencyMs: 0,
        };
      },
    };
  }
}
