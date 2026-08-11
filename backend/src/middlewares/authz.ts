import { Request, Response, NextFunction } from "express";
import { loadSession, requireSession as _requireSession, requireMfaVerified as _requireMfaVerified } from "./session";
import { SellerTier, UserRole } from "../types/user.type";
import { AuthzGate } from "../lib/authzRouter";

// Authorization primitives (Phase 2). Two axes on the User doc: role
// (buyer/seller/admin) and sellerTier (unverified -> verified -> trusted,
// sellers only). Both are read fresh from req.user every request, so an
// admin changing either takes effect on the subject's next request. Every
type CheckFn = (req: Request, res: Response, next: NextFunction) => unknown;

function gate(name: string, checkFn: CheckFn): AuthzGate {
  const fn = async function authzGate(req: Request, res: Response, next: NextFunction) {
    try {
      await loadSession(req, res);
    } catch (err) {
      return next(err);
    }
    return checkFn(req, res, next);
  } as AuthzGate;
  Object.defineProperty(fn, "name", { value: name });
  fn.__isAuthzGate = true;
  return fn;
}

// Explicitly-public route marker — the required declaration for any route
export const PUBLIC: AuthzGate = gate("public", (_req, _res, next) => next());

export const requireSession: AuthzGate = gate("requireSession", _requireSession);

export const requireMfaVerified: AuthzGate = gate("requireMfaVerified", _requireMfaVerified);

async function logAuthzFail(req: Request, detail: string): Promise<void> {
  try {
    const { logAuthzFailure } = await import("../services/audit.service");
    logAuthzFailure({
      actor: req.user?._id,
      action: detail,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { url: req.originalUrl, method: req.method },
    });
  } catch {
    /* audit logging must never break the request */
  }
}

export function requireRole(...roles: UserRole[]): AuthzGate {
  return gate(`requireRole(${roles.join(",")})`, (req, res, next) => {
    if (!req.session) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!req.user || !roles.includes(req.user.role)) {
      logAuthzFail(req, `required_role_${roles.join("_")}`);
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  });
}
export function requireOwnership(resolveOwnerId: (req: Request) => Promise<unknown> | unknown): AuthzGate {
  return gate("requireOwnership", async (req, res, next) => {
    if (!req.session || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const ownerId = await resolveOwnerId(req);
      if (!ownerId || String(ownerId) !== String(req.user._id)) {
        return res.status(404).json({ error: "Not found" });
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}
// Tier is a seller-only axis — a buyer or admin never satisfies a tier
// check regardless of the sellerTier default on their doc.
const TIER_RANK: Record<SellerTier, number> = { unverified: 0, verified: 1, trusted: 2 };

export function requireTier(minTier: SellerTier): AuthzGate {
  if (!(minTier in TIER_RANK)) {
    throw new Error(`requireTier: unknown tier "${minTier}"`);
  }
  return gate(`requireTier(${minTier})`, (req, res, next) => {
    if (!req.session || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.role !== "seller") {
      logAuthzFail(req, `required_tier_${minTier}_not_seller`);
      return res.status(403).json({ error: "Forbidden" });
    }
    if (TIER_RANK[req.user.sellerTier] < TIER_RANK[minTier]) {
      logAuthzFail(req, `required_tier_${minTier}_has_${req.user.sellerTier}`);
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  });
}

