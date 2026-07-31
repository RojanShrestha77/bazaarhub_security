#!/usr/bin/env node
/* eslint-disable no-console */
//
// Timing side-channel measurement for POST /api/auth/login (decision #7).
//
// This is a manual tool, NOT part of the Jest suite (see
// testPathIgnorePatterns in jest.config.js) — it makes real HTTP requests
// against a running server and needs a real sample size to say anything
// statistically meaningful, which is too slow/flaky for a CI unit test.
// Run it deliberately, after implementing the login route, against a
// server with rate limiting either disabled or generously raised — the
// default loginLimiter (20/15min per IP, decision #6) WILL make this
// script's own results meaningless past sample ~20, because 429 responses
// are fast and will fake a "no timing difference" result. This script
// detects and warns about that; it does not work around it for you.
//
// Usage:
//   BASE_URL=http://localhost:5000 \
//   EXISTING_EMAIL=someone-who-is-really-registered@example.com \
//   node tests/timing/login-timing.js
//
// What it measures: wall-clock latency of a wrong-password attempt against
// EXISTING_EMAIL vs. a freshly-generated, guaranteed-nonexistent email, for
// two separate populations of requests, then reports summary statistics
// for both so you can eyeball whether they're distinguishable — not just
// their means (a leak can hide in variance/tails even with matching
// means), per the earlier discussion on why "identical algorithm and
// params on both branches" is necessary but not automatically sufficient.

import { performance } from "node:perf_hooks";
import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const EXISTING_EMAIL = process.env.EXISTING_EMAIL;
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE) || 200;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 1;

if (!EXISTING_EMAIL) {
  console.error(
    "EXISTING_EMAIL is required — point it at a real, already-registered account. " +
      "This script does not create one for you.",
  );
  process.exit(1);
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);
    const start = performance.now();
    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ status: res.statusCode, elapsedMs: performance.now() - start });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function sample(email, n) {
  const results = [];
  for (let i = 0; i < n; i += CONCURRENCY) {
    const batch = Math.min(CONCURRENCY, n - i);
    const batchResults = await Promise.all(
      Array.from({ length: batch }, () =>
        post("/api/auth/login", { email, password: `definitely-wrong-${randomUUID()}` }),
      ),
    );
    results.push(...batchResults);
  }
  return results;
}

function stats(elapsedList) {
  const sorted = [...elapsedList].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  const pct = (p) => sorted[Math.min(n - 1, Math.floor((p / 100) * n))];
  return { n, mean, stddev, p50: pct(50), p95: pct(95), p99: pct(99), min: sorted[0], max: sorted[n - 1] };
}

// Welch's t-test — doesn't assume equal variance between the two groups,
// which matters here since a real leak often shows up as a variance
// difference, not just a mean shift.
function welchT(a, b) {
  const na = a.length;
  const nb = b.length;
  const meanA = a.reduce((x, y) => x + y, 0) / na;
  const meanB = b.reduce((x, y) => x + y, 0) / nb;
  const varA = a.reduce((x, y) => x + (y - meanA) ** 2, 0) / (na - 1);
  const varB = b.reduce((x, y) => x + (y - meanB) ** 2, 0) / (nb - 1);
  const se = Math.sqrt(varA / na + varB / nb);
  return (meanA - meanB) / se;
}

function report(label, s) {
  console.log(
    `${label.padEnd(14)} n=${s.n}  mean=${s.mean.toFixed(2)}ms  stddev=${s.stddev.toFixed(2)}ms  ` +
      `p50=${s.p50.toFixed(2)}  p95=${s.p95.toFixed(2)}  p99=${s.p99.toFixed(2)}  ` +
      `min=${s.min.toFixed(2)}  max=${s.max.toFixed(2)}`,
  );
}

async function main() {
  console.log(`Sampling ${SAMPLE_SIZE} requests per branch against ${BASE_URL} (concurrency=${CONCURRENCY})...`);

  const existingRuns = await sample(EXISTING_EMAIL, SAMPLE_SIZE);
  const nonexistentRuns = await sample(`nobody-${randomUUID()}@example.com`, SAMPLE_SIZE);

  const rateLimited = [...existingRuns, ...nonexistentRuns].filter((r) => r.status === 429).length;
  if (rateLimited > 0) {
    console.warn(
      `\nWARNING: ${rateLimited} requests hit 429 (rate limited). Results below are not meaningful — ` +
        `429 responses return fast and will mask a real timing leak as "no difference". Raise or disable ` +
        `loginLimiter for this run, or lower SAMPLE_SIZE below the window's max.\n`,
    );
  }

  const existingTimes = existingRuns.map((r) => r.elapsedMs);
  const nonexistentTimes = nonexistentRuns.map((r) => r.elapsedMs);

  const existingStats = stats(existingTimes);
  const nonexistentStats = stats(nonexistentTimes);

  report("existing user", existingStats);
  report("nonexistent user", nonexistentStats);

  const t = welchT(existingTimes, nonexistentTimes);
  console.log(
    `\nWelch's t-statistic: ${t.toFixed(3)} (rule of thumb: |t| > ~2 suggests a real difference at this ` +
      `sample size, not noise — this is a heuristic, not a rigorous significance test; increase SAMPLE_SIZE ` +
      `and re-run if it's borderline).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
