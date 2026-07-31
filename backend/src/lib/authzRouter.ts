// Deny-by-default route registration (Phase 2). A plain express.Router()
// lets you register a route with zero authorization middleware and nobody
// notices until it ships unguarded. createAuthzRouter() makes that
// structurally impossible: every route call requires an explicit authz
// declaration (PUBLIC, or an array of gates) as its 2nd argument and throws
// at import/boot time if it's missing or malformed.
import { Router, RequestHandler, IRouter } from "express";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
type Method = (typeof METHODS)[number];

export interface AuthzGate extends RequestHandler {
  __isAuthzGate?: boolean;
}

export type AuthzDeclaration = AuthzGate | AuthzGate[];

const ALL_AUTHZ_ROUTERS: Router[] = [];

function isValidAuthzDeclaration(authz: unknown): authz is AuthzDeclaration {
  if (Array.isArray(authz)) {
    return authz.length > 0 && authz.every((g) => typeof g === "function" && (g as AuthzGate).__isAuthzGate === true);
  }
  return typeof authz === "function" && (authz as AuthzGate).__isAuthzGate === true;
}

// The augmented router: same method names as express.Router but with a
// required authz declaration as the 2nd argument. Omit the base method
// signatures first so the override isn't intersected with Express's
// overloads (which would break contextual typing of inline handlers). The
// trade-off is that this is no longer structurally an Express Router, so
// app.ts casts each router back to RequestHandler at its app.use() site.
export type AuthzRouter = Omit<Router, Method> & {
  [M in Method]: (path: string, authz: AuthzDeclaration, ...handlers: RequestHandler[]) => AuthzRouter;
};

export function createAuthzRouter(): AuthzRouter {
  const router = Router();
  ALL_AUTHZ_ROUTERS.push(router);

  for (const method of METHODS) {
    const original = (router[method] as (...args: unknown[]) => IRouter).bind(router);

    (router as unknown as Record<string, unknown>)[method] = (
      path: string,
      authz: AuthzDeclaration,
      ...handlers: RequestHandler[]
    ) => {
      if (!isValidAuthzDeclaration(authz)) {
        throw new Error(
          `Route ${method.toUpperCase()} ${path} is missing a valid authz declaration. ` +
            `Pass PUBLIC or an array of gates (requireRole(...), requireTier(...), requireOwnership(...), ` +
            `requireMfaVerified, requireSession) from middlewares/authz.ts as the 2nd argument.`,
        );
      }
      const gates = Array.isArray(authz) ? authz : [authz];
      return original(path, ...gates, ...handlers);
    };
  }

  return router as AuthzRouter;
}

interface RegisteredRoute {
  method: string;
  path: string;
  stack: unknown[];
}

export function listAllRegisteredRoutes(): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  for (const router of ALL_AUTHZ_ROUTERS) {
    for (const layer of (router as unknown as { stack: Array<{ route?: { methods: Record<string, boolean>; path: string; stack: unknown[] } }> }).stack) {
      if (!layer.route) continue;
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m]);
      for (const method of methods) {
        routes.push({ method: method.toUpperCase(), path: layer.route.path, stack: layer.route.stack });
      }
    }
  }
  return routes;
}
