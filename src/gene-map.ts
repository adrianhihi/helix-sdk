import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { RepairRecord } from "./types";

const DB_DIR = path.join(os.homedir(), ".helix");
const DB_PATH = path.join(DB_DIR, "gene_map.db");

export class GeneMap {
  private db: Database.Database;

  constructor() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.createTable();
  }

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repair_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        repair_strategy TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration_ms REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Save a repair record to the gene map.
   */
  saveRepair(record: RepairRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO repair_records (agent_id, error_type, error_message, repair_strategy, success, duration_ms, created_at)
      VALUES (@agentId, @errorType, @errorMessage, @repairStrategy, @success, @durationMs, @createdAt)
    `);
    stmt.run({
      agentId: record.agentId,
      errorType: record.errorType,
      errorMessage: record.errorMessage,
      repairStrategy: record.repairStrategy,
      success: record.success ? 1 : 0,
      durationMs: record.durationMs,
      createdAt: record.createdAt,
    });
  }

  /**
   * Get repair records, optionally filtered by agentId.
   */
  getRepairs(agentId?: string): RepairRecord[] {
    let rows: any[];
    if (agentId) {
      const stmt = this.db.prepare(
        "SELECT * FROM repair_records WHERE agent_id = ? ORDER BY created_at DESC"
      );
      rows = stmt.all(agentId);
    } else {
      const stmt = this.db.prepare(
        "SELECT * FROM repair_records ORDER BY created_at DESC"
      );
      rows = stmt.all();
    }

    return rows.map((row) => ({
      id: String(row.id),
      agentId: row.agent_id,
      errorType: row.error_type,
      errorMessage: row.error_message,
      repairStrategy: row.repair_strategy,
      success: row.success === 1,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get aggregate stats across all repair records.
   */
  getStats(): { totalRepairs: number; successRate: number; mostCommonError: string } {
    const totalRow = this.db.prepare("SELECT COUNT(*) as count FROM repair_records").get() as any;
    const totalRepairs: number = totalRow.count;

    if (totalRepairs === 0) {
      return { totalRepairs: 0, successRate: 0, mostCommonError: "none" };
    }

    const successRow = this.db
      .prepare("SELECT COUNT(*) as count FROM repair_records WHERE success = 1")
      .get() as any;
    const successRate = successRow.count / totalRepairs;

    const errorRow = this.db
      .prepare(
        "SELECT error_type, COUNT(*) as count FROM repair_records GROUP BY error_type ORDER BY count DESC LIMIT 1"
      )
      .get() as any;
    const mostCommonError: string = errorRow?.error_type ?? "none";

    return { totalRepairs, successRate, mostCommonError };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
