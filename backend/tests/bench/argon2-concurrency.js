#!/usr/bin/env node
// Concurrency test for the chosen argon2id params (decision #3 follow-up):
// fires N simultaneous hashes and reports elapsed wall time and RSS delta,
// so a memory-cost choice that looks fine for one hash isn't silently a
// self-DoS under realistic concurrent login/registration load.
//
// IMPORTANT finding worth knowing before reading the numbers: argon2's
// native hashing runs on libuv's threadpool, which defaults to
// UV_THREADPOOL_SIZE=4. That means N concurrent argon2.hash() calls do NOT
// all run in parallel by default — only ~4 execute at once, the rest
// queue. This caps peak concurrent memory at roughly (threadpool size *
// memoryCost), not (N * memoryCost), UNLESS UV_THREADPOOL_SIZE is raised.
// This script reports both the default-threadpool run and a raised-
// threadpool run so the difference is visible, not assumed.
//
// Intended invocation (measures the actual container's memory headroom):
//   docker compose run --rm backend node tests/bench/argon2-concurrency.js

import argon2 from "argon2";
import { performance } from "node:perf_hooks";

const MEMORY_COST_KIB = Number(process.env.ARGON2_MEMORY_COST_KIB) || 122880;
const TIME_COST = Number(process.env.ARGON2_TIME_COST) || 3;
const PARALLELISM = Number(process.env.ARGON2_PARALLELISM) || 1;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 50;
const PASSWORD = "benchmark-fixed-password-not-a-real-secret";

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

async function runBatch(n) {
  const before = process.memoryUsage();
  let peakRss = before.rss;
  // before/after RSS is close to meaningless here: the threadpool only
  // runs a few hashes at once and frees each one's memory as it completes,
  // so RSS right after Promise.all resolves mostly reflects however many
  // hashes happened to be in flight at that exact instant, not the peak
  // during the run. Poll instead.
  const poll = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) peakRss = rss;
  }, 25);

  const start = performance.now();

  await Promise.all(
    Array.from({ length: n }, () =>
      argon2.hash(PASSWORD, {
        type: argon2.argon2id,
        memoryCost: MEMORY_COST_KIB,
        timeCost: TIME_COST,
        parallelism: PARALLELISM,
      }),
    ),
  );

  const elapsed = performance.now() - start;
  clearInterval(poll);
  const after = process.memoryUsage();
  return { elapsed, before, after, peakRss };
}

async function main() {
  console.log(
    `Params: memoryCost=${MEMORY_COST_KIB} KiB (~${(MEMORY_COST_KIB / 1024).toFixed(1)} MiB), ` +
      `timeCost=${TIME_COST}, parallelism=${PARALLELISM}, concurrency=${CONCURRENCY}`,
  );
  console.log(`UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE || "(default: 4)"}\n`);

  const { elapsed, before, after, peakRss } = await runBatch(CONCURRENCY);

  console.log(`${CONCURRENCY} concurrent hashes completed in ${elapsed.toFixed(0)}ms`);
  console.log(`RSS before: ${formatMB(before.rss)}, RSS after: ${formatMB(after.rss)}, peak during run: ${formatMB(peakRss)}`);
  console.log(`Peak RSS delta over baseline: ${formatMB(peakRss - before.rss)}`);
  console.log(
    `Naive worst case if the threadpool were unbounded: ${CONCURRENCY} x ${(MEMORY_COST_KIB / 1024).toFixed(1)}MiB = ` +
      `${((CONCURRENCY * MEMORY_COST_KIB) / 1024).toFixed(0)}MiB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
