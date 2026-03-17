# Running the Helix Demo

## Terminal demo

```bash
npx ts-node demo.ts
```

## Web dashboard

```bash
npm run server
# open http://localhost:7842
# click "Run Demo"
```

## Inspect the Gene Map

```bash
npx ts-node demo.ts --show-map
```

## What you'll see

- **Part 1:** Vanilla agent crashes at iteration 8. Requires human fix.
- **Part 2:** Helix-wrapped agent runs all 40 iterations.
  PCEC auto-repairs 4 failures. Zero human interventions.
