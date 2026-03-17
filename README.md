# 🧬 Helix

**Two lines of code. Your agent never halts again.**

[![npm version](https://img.shields.io/badge/npm-v0.1.0-amber)](https://github.com/adrianhihi/helix-sdk)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![powered by](https://img.shields.io/badge/powered%20by-LaoMOS-teal)](https://laomos.ai)

Helix is a self-repair SDK for AI agents.
When your agent hits a failure — rate limits, timeouts,
auth expiry, schema changes — Helix's PCEC engine
automatically detects, repairs, and continues.
Zero human intervention.

Part of the [LaoMOS](https://laomos.ai) ecosystem.

---

## Install

```
npm install @helix/sdk
```

## Usage

```ts
import { wrap } from '@helix/sdk'

// Your existing agent — zero changes required
const agent = async (input: any) => {
  // ... your agent logic
}

// Add Helix — two lines
const resilientAgent = wrap(agent, { geneMarket: true })

// That's it. When your agent fails, Helix self-repairs.
```

## How PCEC works

Every failure triggers a 4-step repair cycle:

🔍 **Perceive**  → classify the error type
🔧 **Construct** → generate repair candidates
⚖️  **Evaluate**  → select the best strategy
✅ **Commit**    → save fix to Gene Map permanently

The same failure will never cost the same repair twice.

## Run the demo

```bash
# Terminal demo — before/after comparison
npx ts-node demo.ts

# Web dashboard — real-time visualization
npm run server
# open http://localhost:7842 → click "Run Demo"

# Inspect stored repairs
npx ts-node demo.ts --show-map
```

## What the demo shows

| | Without Helix | With Helix |
|---|---|---|
| Iterations completed | 7 / 40 | **40 / 40** |
| Human interventions | 1 | **0** |
| Auto-repairs | 0 | **4** |
| Agent status | halted | **running** |

## Gene Map

Every repair is stored permanently in `~/.helix/gene_map.db`.

| Error Type | Strategy | Stored |
|---|---|---|
| RATE_LIMIT | backoff_retry | ✓ |
| HTTP_503 | switch_endpoint | ✓ |
| TIMEOUT | increase_timeout | ✓ |
| AUTH_EXPIRED | rotate_credentials | ✓ |

## Gene Market (Phase 2)

Every repair becomes a Gene Capsule, broadcast to all
Helix instances on the network. One team's fix becomes
every team's immunity.

## Built with

- TypeScript
- better-sqlite3 (Gene Map persistence)
- PCEC engine (Perceive → Construct → Evaluate → Commit)
- Express + SSE (real-time web dashboard)

---

**Part of [LaoMOS](https://laomos.ai) — the AI agent operating system.**
*Autonomous agents that self-repair, evolve, and share immunity.*
