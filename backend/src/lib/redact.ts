// Log redaction (rubric 2.5.3 / 3 — no sensitive data in logs). Two layers:
// object redaction for structured payloads and string redaction for URLs
// and free-text log lines, plus a console.error wrapper so even accidental
// error logging is scrubbed.
const SENSITIVE_KEY =
  /password|secret|token|authorization|cookie|totp[_-]?secret|recovery[_-]?code|credit[_-]?card|cvv|ssn|pin|api[_-]?key|stripe[_-]?key|stripe[_-]?secret/i;

const REDACTED = "[REDACTED]";

export function redactObject(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      result[key] = REDACTED;
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function redactString(str: unknown): unknown {
  if (typeof str !== "string") return str;
  return str
    .replace(
      /(password|secret|token|authorization|api[_-]?key|stripe[_-]?key|stripe[_-]?secret)=[^&\s]+/gi,
      "$1=" + REDACTED,
    )
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/=]+/g, "$1" + REDACTED)
    .replace(/totp[_-]?secret["\s:=]+(?!\[REDACTED\])[^\s,"}\]]+/gi, "totp_secret=" + REDACTED)
    .replace(/recovery[_-]?code["\s:=]+(?!\[REDACTED\])[^\s,"}\]]+/gi, "recovery_code=" + REDACTED);
}

export function wrapConsoleError(): () => void {
  const original = console.error.bind(console);
  console.error = function (...args: unknown[]) {
    const redacted = args.map((a) => {
      if (typeof a === "string") return redactString(a);
      if (a instanceof Error) {
        a.message = redactString(a.message) as string;
        return a;
      }
      if (a && typeof a === "object") return redactObject(a);
      return a;
    });
    Reflect.apply(original, console, redacted);
  };
  return () => {
    console.error = original;
  };
}
