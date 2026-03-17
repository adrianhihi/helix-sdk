import https from "https";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=monad,ethereum,bitcoin&vs_currencies=usd";

interface LiveResult {
  source: string;
  prices: Record<string, number>;
  httpStatus: number;
  timestamp: number;
}

function fetchJSON(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "User-Agent": "helix-sdk/0.1.0",
        "Accept": "application/json",
      },
    };
    https
      .get(options, (res) => {
        const status = res.statusCode ?? 0;
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (status === 429) {
            const err = new Error("429 Too Many Requests — CoinGecko");
            err.name = "RateLimitError";
            reject(err);
            return;
          }
          if (status === 503) {
            const err = new Error("503 Service Unavailable — CoinGecko");
            err.name = "HttpError";
            reject(err);
            return;
          }
          if (status >= 400) {
            const err = new Error(`${status} HTTP Error — CoinGecko`);
            err.name = "HttpError";
            reject(err);
            return;
          }
          try {
            resolve({ status, body: JSON.parse(data) });
          } catch {
            const err = new Error("JSON parse error — CoinGecko response");
            err.name = "JsonParseError";
            reject(err);
          }
        });
        res.on("error", reject);
      })
      .on("error", (err) => {
        const timeoutErr = new Error("Request timeout — CoinGecko");
        timeoutErr.name = "TimeoutError";
        reject(timeoutErr);
      });
  });
}

export class LiveCryptoScenario {
  totalIterations: number;
  agent: (iteration: number) => Promise<LiveResult>;

  constructor(totalIterations: number = 15) {
    this.totalIterations = totalIterations;

    this.agent = async (_iteration: number): Promise<LiveResult> => {
      const { status, body } = await fetchJSON(COINGECKO_URL);

      const prices: Record<string, number> = {};
      if (body.bitcoin) prices.bitcoin = body.bitcoin.usd;
      if (body.ethereum) prices.ethereum = body.ethereum.usd;
      if (body.monad) prices.monad = body.monad.usd;

      return {
        source: "CoinGecko",
        prices,
        httpStatus: status,
        timestamp: Date.now(),
      };
    };
  }
}
