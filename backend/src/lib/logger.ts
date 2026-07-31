import { IS_PROD } from "../configs";

// Minimal structured logger. Deliberately no third-party dependency for the
// core wiring so there is no supply-chain surface to defend here; swap for
// pino/winston later behind this same interface if shipping volume grows.
//
// Security requirement (rubric 2.5.3 / 3): NEVER log secrets. Every log
// object passes through redact() so password / token / secret / cookie /
// authorization fields can't leak into log storage even if a caller passes
// a raw request object by mistake.
type LogMeta = Record<string, unknown>;

const SENSITIVE_KEY_RE = /pass(word)?|token|secret|otp|totp|code|cookie|authorization|apikey|api_key|creditcard|cvv/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: string, message: string, meta?: LogMeta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? (redact(meta) as LogMeta) : {}),
  };
  // Structured single-line JSON so log shippers can parse it. In dev, a
  // human-readable form is fine too.
  const line = IS_PROD ? JSON.stringify(entry) : `[${entry.level}] ${entry.message} ${meta ? JSON.stringify(redact(meta)) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => emit("info", message, meta),
  warn: (message: string, meta?: LogMeta) => emit("warn", message, meta),
  error: (message: string, meta?: LogMeta) => emit("error", message, meta),
};
