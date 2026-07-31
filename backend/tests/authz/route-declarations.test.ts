// The point of Slice 1: fail the build if any registered route lacks an
// authz declaration. Two checks, deliberately redundant:
//  1. Every route known to createAuthzRouter() has a tagged authz gate as
//     the first entry in its middleware stack.
//  2. The raw count of routes Express actually registered anywhere in the
//     app equals the count createAuthzRouter() knows about — this is what
//     catches a route added via a bypassed, plain express.Router()/app.get()
//     call, which check 1 alone can't see (a bypassed route never enters
//     createAuthzRouter()'s own bookkeeping in the first place).
import { createApp } from "../../src/app";
import { listAllRegisteredRoutes } from "../../src/lib/authzRouter";

function countRawExpressRoutes(app) {
  let count = 0;
  function walk(stack) {
    for (const layer of stack) {
      if (layer.route) {
        count += 1;
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  }
  walk(app._router.stack);
  return count;
}

describe("route declaration enumeration", () => {
  it("every registered route's first middleware is a tagged authz gate", () => {
    createApp();
    const routes = listAllRegisteredRoutes();

    expect(routes.length).toBeGreaterThan(0);

    const undeclared = routes.filter((r) => r.stack[0]?.handle?.__isAuthzGate !== true);
    expect(undeclared.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it("no route bypasses createAuthzRouter() (raw Express route count matches the declared count)", () => {
    const app = createApp();
    const rawCount = countRawExpressRoutes(app);
    const declaredCount = listAllRegisteredRoutes().length;
    expect(rawCount).toBe(declaredCount);
  });
});
