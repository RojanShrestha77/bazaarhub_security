// Single typed error the whole app throws for expected, client-facing
// failures. The central error handler in app.ts maps statusCode -> HTTP
// status; anything that is NOT an HttpError is treated as an unexpected
// 500 and its message is never leaked to the client (threat model:
// Information Disclosure — no stack traces or raw errors to the wire).
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}
