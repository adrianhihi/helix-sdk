# Helix

**Two lines of code. Your agent never halts again.**

## Install

```
npm install @helix/sdk
```

## Usage

```ts
import { wrap } from '@helix/sdk'

// Your existing agent — zero changes required
const agent = async (input) => { ... }

// Add Helix — PCEC self-repair + Gene Market immunity
const resilientAgent = wrap(agent, { geneMarket: true, verbose: true })

// That's it. When your agent fails, Helix:
// 1. Perceives the error type
// 2. Constructs repair candidates
// 3. Evaluates the best strategy
// 4. Commits the fix to Gene Map permanently
```

## Run the demo

```
npx ts-node demo.ts             # see before/after comparison
npx ts-node demo.ts --show-map  # inspect the gene map
```

## How it works

Every failure your agent hits triggers PCEC:

```
🔍 Perceive  → classify the error
🔧 Construct → generate repair strategies
⚖️  Evaluate  → select the best one
✅ Commit    → save to Gene Map forever
```

The same failure will never cost the same repair twice.

## Gene Market (Phase 2)

Every repair becomes a Gene Capsule, broadcast to all
Helix instances on the network. One team's fix becomes
every team's immunity.

Part of the LaoMOS ecosystem — laomos.ai
