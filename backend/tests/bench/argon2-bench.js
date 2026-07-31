#!/usr/bin/env node
// Argon2id parameter benchmark (decision #3). Finds the memoryCost (m) that
// lands close to a ~250ms target hash time, with parallelism fixed at 1 and
// timeCost fixed at a moderate default — per the instruction to tune m, not
// guess all three knobs at once.
//
// MUST be run on the actual deployment target, not a dev laptop — see
// docs/security-decisions.md for why. Intended invocation:
//   docker compose run --rm backend node tests/bench/argon2-bench.js
//
// so it measures inside the same Alpine container with the same memory
// limit that will actually run this code.

import argon2 from "argon2";
import { performance } from "node:perf_hooks";

const TARGET_MS = 250;
const TIME_COST = 3;
const PARALLELISM = 1;
const TRIALS_PER_CANDIDATE = 5;
const PASSWORD = "benchmark-fixed-password-not-a-real-secret";

async function timeHash(memoryCostKiB) {
  const times = [];
  for (let i = 0; i < TRIALS_PER_CANDIDATE; i++) {
    const start = performance.now();
    await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: memoryCostKiB,
      timeCost: TIME_COST,
      parallelism: PARALLELISM,
    });
    times.push(performance.now() - start);
  }
  return times.reduce((a, b) => a + b, 0) / times.length;
}

async function main() {
  console.log(`Environment: ${process.platform} ${process.arch}, Node ${process.version}`);
  console.log(`Fixed: timeCost=${TIME_COST}, parallelism=${PARALLELISM}, target=${TARGET_MS}ms\n`);

  // Phase 1: exponential search to bracket the target.
  let low = 8192; // 8 MiB
  let high = low;
  let highMean = await timeHash(high);
  console.log(`m=${high.toString().padStart(7)} KiB  mean=${highMean.toFixed(1)}ms`);

  while (highMean < TARGET_MS && high < 1_048_576) {
    low = high;
    high *= 2;
    highMean = await timeHash(high);
    console.log(`m=${high.toString().padStart(7)} KiB  mean=${highMean.toFixed(1)}ms`);
  }

  // Phase 2: binary search between low and high to converge.
  let bestM = high;
  let bestMean = highMean;
  for (let i = 0; i < 6 && high - low > 1024; i++) {
    const mid = Math.round((low + high) / 2 / 1024) * 1024;
    const mean = await timeHash(mid);
    console.log(`m=${mid.toString().padStart(7)} KiB  mean=${mean.toFixed(1)}ms`);
    if (mean < TARGET_MS) {
      low = mid;
    } else {
      high = mid;
      bestM = mid;
      bestMean = mean;
    }
  }

  console.log(`\nChosen: memoryCost=${bestM} KiB (~${(bestM / 1024).toFixed(1)} MiB), timeCost=${TIME_COST}, parallelism=${PARALLELISM}`);
  console.log(`Measured mean hash time at chosen params: ${bestMean.toFixed(1)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
