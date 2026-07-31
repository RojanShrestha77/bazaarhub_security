import "dotenv/config";
import express, { Request, Response, NextFunction, RequestHandler } from "express";
import { AuthzRouter } from "./lib/authzRouter";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { redactString, wrapConsoleError } from "./lib/redact";
import { CORS_ORIGIN } from "./configs";

import authRoutes from "./routes/auth.routes";
import metaRoutes from "./routes/meta.routes";
import adminRoutes from "./routes/admin.routes";
import adminLogRoutes from "./routes/admin-logs.routes";
import profileRoutes from "./routes/profile.routes";
import listingRoutes from "./routes/listing.routes";
import categoryRoutes from "./routes/category.routes";
import cartRoutes from "./routes/cart.routes";
import wishlistRoutes from "./routes/wishlist.routes";
import messagingRoutes from "./routes/messaging.routes";
import addressRoutes from "./routes/address.routes";
import notificationRoutes from "./routes/notification.routes";
import returnRoutes from "./routes/return.routes";
import escrowRoutes from "./routes/escrow.routes";
import escrowWebhookRoutes from "./routes/escrow-webhook.routes";
import verificationRoutes from "./routes/verification.routes";
import sellerRoutes from "./routes/seller.routes";

// Configured app, exported without connecting to Mongo or calling listen()
// so tests (supertest) can exercise it directly. index.ts is the only place
// that connects + listens.
// The authz routers are structurally not Express Routers at the type level
// (see lib/authzRouter.ts), so mount them through this cast — they are real
// Router instances at runtime.
const mount = (r: AuthzRouter): RequestHandler => r as unknown as RequestHandler;

export function createApp() {
  const app = express();

  // Trust exactly ONE proxy hop (the frontend nginx). This makes req.ip the
  // real client IP from the last X-Forwarded-For entry, which rate limiting
  // and audit logging depend on. Deliberately `1`, never `true`: trusting all
  // hops would let a client spoof X-Forwarded-For and forge req.ip again.
  app.set("trust proxy", 1);

  // Security headers — explicit CSP directives mirroring the frontend nginx
  // policy so there's one policy to reason about, not two that could drift.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      // The frontend is a separate origin (Next.js on :3000) that legitimately
      // loads images and other assets from this API. Helmet's default CORP of
      // "same-origin" blocks those cross-origin <img> loads, so relax it to
      // "cross-origin" — the API is meant to be consumed from the frontend
      // origin. Access control still comes from CORS + the route authz.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  // Credentialed CORS. Allow the explicitly configured origin, plus ANY
  // localhost / 127.0.0.1 port in development so the frontend works no matter
  // which port Next.js picks. Never a wildcard (invalid with credentials).
  // Requests with no Origin (curl, health checks, server-to-server) pass.
  // IMPORTANT: return callback(null, false) — not an Error — for disallowed
  // origins, so the request still completes (without CORS headers) instead of
  // hitting the 500 error handler, which would surface as a confusing CORS
  // failure in the browser.
  const isLocalhost = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === CORS_ORIGIN || isLocalhost(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  // Redacting morgan — sensitive query params/headers masked before logging.
  app.use(
    morgan((tokens, req, res) =>
      [
        tokens.method(req, res),
        redactString(tokens.url(req, res)),
        tokens.status(req, res),
        tokens["response-time"](req, res),
        "ms",
      ].join(" "),
    ),
  );

  // The Stripe webhook MUST receive the raw body for signature verification,
  // so it is mounted BEFORE express.json() with express.raw().
  app.use("/api/escrow/webhook", express.raw({ type: "application/json" }), mount(escrowWebhookRoutes));
  app.use(express.json());
  app.use(cookieParser());

  app.use("/", mount(metaRoutes));
  app.use("/api/auth", mount(authRoutes));
  app.use("/api/admin", mount(adminRoutes));
  app.use("/api/admin", mount(adminLogRoutes));
  app.use("/api/profiles", mount(profileRoutes));
  app.use("/api/listings", mount(listingRoutes));
  app.use("/api/categories", mount(categoryRoutes));
  app.use("/api/cart", mount(cartRoutes));
  app.use("/api/wishlist", mount(wishlistRoutes));
  app.use("/api/conversations", mount(messagingRoutes));
  app.use("/api/addresses", mount(addressRoutes));
  app.use("/api/notifications", mount(notificationRoutes));
  app.use("/api/returns", mount(returnRoutes));
  app.use("/api/escrow", mount(escrowRoutes));
  app.use("/api/verification", mount(verificationRoutes));
  app.use("/api/seller", mount(sellerRoutes));

  // Wrap console.error to redact sensitive data.
  wrapConsoleError();

  // Information Disclosure defense: never leak a stack trace or raw error.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export default createApp;
