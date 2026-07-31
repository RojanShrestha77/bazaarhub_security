import fs from "node:fs";
import https from "node:https";
import { createApp } from "./app";
import { connectDB } from "./database/mongodb";
import { ensureDummyHash } from "./services/password.service";
import { expireStaleReservations } from "./services/escrow.service";
import { PORT } from "./configs";
import { logger } from "./lib/logger";

// Opt-in TLS. When HTTPS_ENABLED=true and a key/cert are present, the API is
// served over HTTPS so cookies (Secure / __Host-) and HSTS are exercised over a
// real encrypted channel. Otherwise it serves plain HTTP (Docker/dev default,
// and behind a TLS-terminating reverse proxy in production).
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === "true";
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH || "certs/key.pem";
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH || "certs/cert.pem";

// Periodically return stock held by abandoned (unpaid) checkouts. Runs in-
// process; a multi-replica deployment should move this to a single scheduled
// worker (or a Mongo TTL-driven job) so the sweep doesn't run N times over.
const RESERVATION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function startReservationSweep() {
  const timer = setInterval(() => {
    expireStaleReservations()
      .then((n) => {
        if (n > 0) logger.info(`Reservation sweep: cancelled ${n} stale order(s), stock restored`);
      })
      .catch((err) => logger.error("Reservation sweep failed", { error: (err as Error).message }));
  }, RESERVATION_SWEEP_INTERVAL_MS);
  timer.unref(); // don't keep the process alive just for the sweep
}

async function start() {
  try {
    await connectDB();
    // Pre-warm the argon2id dummy hash so the first login doesn't pay the
    // one-off computation cost (decision #7 timing parity).
    await ensureDummyHash();
    const app = createApp();
    if (HTTPS_ENABLED) {
      const options = { key: fs.readFileSync(HTTPS_KEY_PATH), cert: fs.readFileSync(HTTPS_CERT_PATH) };
      https.createServer(options, app).listen(PORT, () => logger.info(`HTTPS server listening on port ${PORT}`));
    } else {
      app.listen(PORT, () => logger.info(`HTTP server listening on port ${PORT}`));
    }
    startReservationSweep();
  } catch (err) {
    logger.error("Startup error", { error: (err as Error).message });
    process.exit(1);
  }
}

start();
