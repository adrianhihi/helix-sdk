export interface HelixOptions {
  geneMarket?: boolean;
  verbose?: boolean;
}

export interface RepairRecord {
  id: string;
  agentId: string;
  errorType: string;
  errorMessage: string;
  repairStrategy: string;
  success: boolean;
  durationMs: number;
  createdAt: string;
}

export interface PCECResult {
  perceived: string;
  constructed: string[];
  evaluated: string;
  committed: boolean;
}
