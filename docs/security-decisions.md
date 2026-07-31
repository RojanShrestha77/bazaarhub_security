## 2026-07-15 — CI security scanning

Set up CodeQL, Semgrep, Trivy, gitleaks in Actions. Fails build on high severity.
Chose gitleaks over relying only on GitHub secret scanning — wanted it to block the
build, not just alert after the fact.

## 2026-07-15 — Container hardening

Multi-stage builds, non-root user in both Dockerfiles. Smaller attack surface if
the app is compromised — no build tooling in the runtime image.

## 2026-07-15 — Session strategy

Server-side sessions in Mongo, not JWT.
Rejected JWT: BazaarHub is a single API + single DB — no distributed verification
problem, so statelessness buys nothing but costs revocation. Marketplace needs
instant kill: fraudulent seller downgrade, account lockout, and MFA step-up all
break if claims are frozen in a token for 15 min.
Also: pre-MFA vs post-MFA state is a session flag server-side; as a JWT claim it's
an MFA-bypass waiting to happen.
Considered JWT + refresh rotation w/ reuse detection — good, but it's a session
store with extra moving parts I'd have to defend.
TTL index on sessions collection so expired records don't accumulate.

## 2026-07-16 — RBAC: deny-by-default routing

Every route is registered through `createAuthzRouter()` (backend/src/lib/authzRouter.js),
which requires an explicit authorization declaration (`PUBLIC` or an array of tagged gates
from `src/middleware/authz.js`) as the 2nd argument to every route call — it throws at
import/boot time if that's missing. This isn't just a lint rule: a route literally cannot be
registered without declaring what it needs. A Jest test
(`backend/tests/authz/route-declarations.test.js`) additionally walks the live Express route
table and fails the build if any registered route's first middleware isn't a tagged gate, or
if the raw route count doesn't match what the wrapper knows about (catches someone bypassing
the wrapper entirely with a raw `express.Router()`).

Role (buyer/seller/admin) and seller tier (unverified -> verified -> trusted) are kept as
separate axes on `User`, not one combined enum — a seller's verification progress and a
user's role are orthogonal and change independently. Neither is cached on the Session
document; both are read fresh from `req.user` (populated from Mongo on every request), so an
admin's role/tier change takes effect on the subject's very next request without requiring
them to log back in.

## 2026-07-16 — Admin actions require MFA, not just the role

`requireRole("admin")` alone would let a stolen pre-MFA admin session (attacker has the
password but not the TOTP device) reach role/tier-change endpoints. Every admin route pairs
`requireRole("admin")` with `requireMfaVerified` — same class of gap `/password/change`
already closed in Phase 1.

## 2026-07-16 — Role/tier changes revoke sessions and are audited

Any admin-issued role or tier change calls `revokeAllSessionsForUser` on the subject
(`src/services/adminService.js`) — stale privileges (or a stale downgrade) must not survive
in an already-issued session token. Every change also writes an `AuditLog` entry (actor,
subject, before, after, timestamp) before the request completes; if that write fails the
request fails too (500), rather than silently letting a privilege change go unlogged.

No multi-document Mongo transaction wraps the write + revoke + audit sequence: this project
runs against a standalone `mongod` in dev/test (`mongodb-memory-server`), and standalone
`mongod` doesn't support multi-document transactions (replica-set only). The ordering is
chosen deliberately instead — the subject's field is written first, sessions are revoked
second, and the audit entry is written last, so an audit-write failure surfaces as a loud
500 rather than a change that landed with no record of who made it.

## 2026-07-16 — Profile mass assignment: structural, not filtered

`Profile` (backend/src/models/Profile.js) is a separate collection from `User`, not fields
bolted onto it. It has no `role`, `sellerTier`, `mfaEnabled`, or email-verification field at
all — so a mass-assignment attempt on those has nothing to write to, structurally, rather
than relying on an allowlist filter that a future refactor could accidentally loosen. The zod
schema (`src/validators/profile.schemas.js`) is `.strict()` on top of that as defense in
depth, and `profileService.updateProfile` still builds an explicit `$set` from a hardcoded
field list rather than spreading the validated body — the same two-layer discipline Phase 1
established for `User.create()`.

Public vs. private profile data uses two separate serializer functions
(`serializePublicProfile` / `serializePrivateProfile` in `src/services/profileService.js`),
not one function with a delete-on-the-way-out flag — a forgotten flag on a future call site
is a silent data leak, a wrong import is a visible mistake.

## 2026-07-16 — IDs are Mongo ObjectIds, not opaque tokens (accepted residual risk, revised)

`:id` routes (profile viewing, admin role/tier changes) use the Mongo `_id` directly rather
than a separate opaque/random public identifier. ObjectIds embed a 4-byte creation timestamp,
so they are *not* uniformly random — an attacker who knows roughly when an account was
created can narrow the search space for that account's id far below the full 96 bits of
entropy, though the remaining ~40 bits (5-byte random + 3-byte counter) still make brute-force
enumeration impractical for a single guess *if attempts are throttled*.

**That "if" was originally unstated and, when the Phase 2 self-attack pass actually tested it,
untrue.** `GET /api/profiles/:id` had no rate limiter at all — the acceptance below was written
assuming a bounded guess rate without anything in the code enforcing that bound. This wasn't
caught by design review, it was caught by hammering the route with 20 rapid requests and
watching all 20 succeed. The original entry is being revised rather than left to stand, because
the reasoning it gave ("brute-force is impractical") was doing work the code wasn't actually
doing.

The acceptance now explicitly depends on `profileReadLimiter` (`src/middleware/rateLimiters.js`,
120 requests / 15 min per IP), added specifically to back this decision, not as a generic
hardening pass. With that limiter in place: nothing in the current API exposes an ordered
listing of ids to enumerate against (no "list all users"/"list all sellers" endpoint); every
`:id` route re-resolves the resource from the DB and checks ownership/role server-side rather
than trusting the id as proof of anything, so a guessed id still can't be acted on without
already owning it or holding the matching admin privilege; and the per-IP request budget bounds
how many ids a single attacker can test against the remaining ~40 bits of non-timestamp entropy
per window. Revisit if a future phase adds a public listing endpoint that narrows the
timestamp-adjacency search space, if the "guess a low-cardinality private resource id" surface
grows (e.g. a future orders/documents resource with low natural volume), or if the rate limiter
is ever removed or its store becomes distributed without a shared budget (see the FIXME on
`express-rate-limit`'s in-memory store in `rateLimiters.js` — the same horizontal-scaling gap
applies here).

## 2026-07-16 — Admin role/tier changes block self-targeting

The Phase 2 self-attack pass found that an admin could `PATCH` their own account through the
role/tier-change routes. It succeeded — the write landed, then `revokeAllSessionsForUser`
immediately killed the very session that made the request. That's a bad experience on its own,
but the real reason this is now blocked outright (`SelfTargetError` in
`src/services/adminService.js`, returned as a 400) rather than left as a "don't do that" is
recoverability: if the admin who self-demotes happens to be the *last* admin account, the
change is unrecoverable from inside the app — there is no seed script, no break-glass account,
and nobody left holding the admin role to promote anyone back, including that same person.

The alternative — allow self-targeting but block it only when the actor is the last remaining
admin — was considered and rejected: it needs a live `count({role: "admin"})` query racing
against concurrent admin role changes to be reliable (two admins simultaneously demoting two
different other admins could both read "not the last one" and still leave zero), and it still
permits an admin locking themselves out of their own session on every other self-targeted
change (tier included, where "last admin" doesn't even apply). Blocking self-targeting
unconditionally on both routes is simpler and has no legitimate use case it forecloses — an
admin doesn't need this endpoint to manage their own account.

## 2026-07-16 — Data export/import is allowlist-scoped and self-only

`GET /api/profiles/me/export` and `POST /api/profiles/me/import`
(backend/src/routes/profile.routes.js) both operate exclusively on `req.user._id` — never a
body- or param-supplied id — so cross-user data exposure isn't a filtering question, there's
no code path that can even reach another user's document. Export assembles its response from
an explicit field list rather than a raw Mongoose `.populate()`/`.toObject()`, since populate
can pull in referenced documents (e.g. a future `Session` or `Order` populate) that were never
meant to leave the server. Import reuses the exact same `.strict()` `profileUpdateSchema` as
the regular profile-update route — not a separate, looser "import" schema — so it's provably
impossible to write role/tier/verification state through this path; it's the same
allowlist-enforcing code, re-entered from a different route.

## 2026-07-16 — Prices are integer minor units, never floats

`Listing.priceMinorUnits` (`backend/src/models/Listing.js`) stores price as an integer count
of paisa (1/100 NPR), not a decimal/float rupee amount. Binary floating point can't exactly
represent most decimal fractions — the textbook `0.1 + 0.2 !== 0.3` — and that error compounds
across repeated price math (cart totals across multiple items, future discounts/tax). This is a
correctness decision as much as a security one: a marketplace where the same cart can total to
two different values depending on operation order or accumulated rounding is a real
business-logic and trust problem, not just an aesthetic one. Every price field and every price
computation in this codebase (Listing, and Cart's live re-resolution in Slice 4) works in
integer minor units end to end; conversion to a display rupee amount happens only at the
frontend's render boundary, never in stored data or in the arithmetic path.

## 2026-07-16 — Search: `$text`, not `RegExp`, and query-param validation blocks operator injection

Two independent, unrelated injection classes live in the same endpoint (`GET /api/listings/
search`) and needed two independent defenses:

**ReDoS via a user-controlled regex.** If free-text search were implemented as `new RegExp(userInput)` against `title`/`description`, an attacker fully controls the compiled pattern —
a catastrophic-backtracking payload (`(a+)+$`-shaped) against a similarly-shaped stored string
can take exponential time and hang a query thread. The fix isn't "sanitize/escape the regex" —
it's "there is no regex": `q` is matched via Mongo's `$text` operator against a text index on
`title`+`description` (`Listing.js`'s `.index({ title: "text", description: "text" })`).
`$text` tokenizes and stems the search string; it never compiles user input as a pattern, so
this class of attack doesn't apply to this field at all. `tests/search/injection.test.js` sends
a 40-character repeated-character-plus-terminator payload (the canonical trigger shape for a
vulnerable naive backtracking regex) as `q` and asserts the response completes in under 1
second — proving flat response time, not just "didn't crash."

**NoSQL operator injection via query params.** Express's query parser (`qs`) turns
`?category[$gt]=` into `req.query.category = {"$gt": ""}` — an object, not the string the code
expects. If that object reached a Mongo filter unvalidated (`Listing.find({ category:
req.query.category })`), the attacker would control a Mongo query operator directly. The fix:
`validateQuery(searchQuerySchema)` (new middleware in `src/middleware/validate.js`, mirroring
`validateBody`) runs every query param through a zod schema where every field is a plain
`z.string()`/`z.coerce.number()` type — an object input fails `safeParse` cleanly (string
types don't match; number coercion on an object produces `NaN`, which then fails `.int()`) —
so the injection payload never survives past the validation middleware, let alone reaches
`listingService.searchListings`, which additionally builds its Mongo filter field-by-field from
`req.validatedQuery` rather than ever spreading the query object. Tested explicitly against
every search param (`q`, `category`, `minPrice`, `maxPrice`, `page`, `limit`) individually —
all reject with 400.

Pagination `limit` is capped at 50 in the zod schema (`.max(50)`) — a request for a larger page
size is rejected outright, not silently clamped, so the cap is visible to the client rather than
a surprise truncation; `searchListings` also clamps again server-side as defense in depth,
matching the two-layer validation pattern used everywhere else in this codebase.

## 2026-07-16 — Listing photos are re-encoded to strip EXIF/GPS

`src/middleware/listingImageUpload.js` pipes every uploaded listing image through `sharp`
before writing it to disk — `.rotate()` (auto-orient using the EXIF orientation tag, since
that information is about to be discarded) then `.resize()` (caps dimensions, incidental
defense against decompression-bomb-style huge images) then re-encode to the sniffed format.
Sharp strips all metadata (EXIF/IPTC/XMP) by default unless `.withMetadata()` is called, which
it never is here — the stored file is the re-encoded output, not the raw upload.

This is a domain-specific privacy control, not a generic "images might carry metadata"
footnote: seller photos taken on a phone commonly embed GPS coordinates in EXIF, and BazaarHub
is a marketplace where buyer and seller arrange in-person pickup. A listing photo silently
leaking the seller's home address (or wherever the photo was taken) is a real physical-safety
concern specific to this kind of app, not a hypothetical. `tests/images/upload.test.js` embeds
real GPS EXIF into a test JPEG via `sharp`'s own `withMetadata`, uploads it, and asserts the
stored file's `sharp(...).metadata().exif` is `undefined`.

Re-encoding also serves as a second content check beyond magic-byte sniffing: `sharp` throws on
bytes that pass `file-type`'s signature check but don't actually decode as that format, so a
crafted file that merely starts with valid magic bytes but is malformed/polyglot past that point
fails here rather than being written to disk as-is.

## 2026-07-16 — XSS defense: React escaping is primary, CSP is defense-in-depth

Two independent layers, and it matters which one is actually load-bearing.

**Primary defense: React's default JSX escaping.** Listing title/description are fully
attacker-controlled — any seller can set them to anything via the API directly, bypassing
whatever a frontend form validates. `ListingDetail.jsx` renders both as plain `{title}`/
`{description}` JSX children — never `dangerouslySetInnerHTML`, no markdown/rich-text renderer,
no `href`/`src` attribute built from listing content. That's what actually stops stored XSS: a
payload like `<img src=x onerror=alert(1)>` in a title becomes literal text on the page, not a
DOM element, because React escapes text children by construction. `ListingDetail.test.jsx`
proves this against a mocked API response carrying both an `<img onerror>` and a `<script>`
payload — asserts the raw string renders as visible text, that zero `<script>` elements exist
in the resulting DOM, and that no `onerror` attribute exists on any real `<img>` element.
Grepped the whole frontend for `dangerouslySetInnerHTML` and `href={`: zero matches.

**Defense-in-depth: Content-Security-Policy.** Set in `frontend/nginx.conf` (`add_header
Content-Security-Policy ... always` on the server block that serves the actual HTML/JS a
browser executes) and mirrored via an explicit `helmet({ contentSecurityPolicy: { directives:
{...} } })` override in `backend/src/app.js` for the API's own JSON responses (a browser never
renders JSON as HTML, so the backend's copy of this header doesn't protect the app page itself
— nginx's does; the backend copy exists so there's one policy declared twice in the same shape
rather than one real policy and an undeclared gap). Policy: `default-src 'self'; script-src
'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';
frame-ancestors 'none'; base-uri 'self'; object-src 'none'`.

**What it blocks**: any `<script>` tag or event-handler attribute containing inline JavaScript
(no `'unsafe-inline'` in `script-src`) — so even if a future bug *did* let a payload reach the
DOM as real markup, an inline `<script>` or `onerror="..."` attribute still wouldn't execute;
`javascript:` URLs (not a valid `script-src` source); loading any script, stylesheet-triggered
resource, or fetch/XHR target from a different origin; the page being framed by another origin
(`frame-ancestors 'none'`); a page-injected `<base>` tag hijacking relative URLs (`base-uri
'self'`); and any `<object>`/`<embed>` plugin content (`object-src 'none'`).

**What it does NOT block**: the actual stored-XSS scenario tested above doesn't reach CSP at
all — React never creates the `<script>`/`onerror` markup in the first place, so there's
nothing for CSP to intercept. If application code ever did call
`dangerouslySetInnerHTML`/`eval`/`new Function()` with attacker content using only same-origin
script (no external URL, no inline `<script>` tag — e.g. constructing a DOM event handler via
JS rather than an HTML attribute), `script-src 'self'` alone would not stop it, since the
executing code is still "from" the app's own origin. CSP also doesn't defend against a
same-origin issue like an open redirect or DOM-based XSS driven entirely by first-party code —
it constrains *where* resources load from and *whether* inline/eval-style execution is allowed,
not *what* first-party code is allowed to do. `style-src 'unsafe-inline'` is a real, deliberate
gap (React's inline `style={{}}` prop needs it, and no CSS-injection-to-JS-execution path exists
in current browsers to make this a meaningful escalation on its own) — worth tightening to a
nonce-based approach if a future phase adds user-controlled styling.

## 2026-07-16 — Draft listings were visible to any authenticated user (self-attack finding, fixed)

Found by attacking the Phase 3 endpoints directly, not by design review: `GET /api/listings/:id`
had no status check at all — any authenticated user who knew or guessed a listing's id could
read another seller's unpublished `draft` title/description/price, before the seller ever chose
to publish it. The route was written as "public-to-any-authenticated-user, same as profiles"
without separately considering that, unlike a profile, a listing has a pre-publication state
that's meant to be private to its owner.

Fixed in `src/routes/listing.routes.js`: both `GET /:id` and `GET /:id/images/:filename` now
check `listing.status !== "draft" || listing belongs to the requester` before returning
anything, and return the same 404 a nonexistent id gets — not a 403 — so a stranger probing
draft ids can't distinguish "doesn't exist" from "exists but is a draft I can't see." Active,
sold, and withdrawn listings remain visible to anyone, matching the original intent; only the
pre-publication `draft` state is now actually private. `tests/listings/listings.test.js`
covers all three cases: stranger blocked, owner still sees their own draft, active listing
stays public.

## 2026-07-16 — Phase 4: Escrow state machine

### State machine is data-driven, not scattered if-statements

`src/services/escrowService.js` declares the full TRANSITIONS table as data:
`{ from, to, whoCanTrigger[], guards[] }`. Every transition goes through
`transitionOrder()` which looks up the table, checks whoCanTrigger, runs guards, then
does atomic `findOneAndUpdate({ _id, status: fromStatus }, { $set: { status: toStatus } })`.
Null return = "someone else won the race" — same TOCTOU-eliminating idiom as
recoveryCodeService. Illegal transitions are audit-logged as security events
(EscrowEvent with metadata.illegal), not just 400 errors.

### Atomic updates eliminate TOCTOU on every state transition

`findOneAndUpdate` with current status in match condition. Never findById + save().
Concurrency tests (tests/escrow/concurrency.test.js) use Promise.all pairs — two
simultaneous release requests, release vs dispute, double refund, webhook replay —
assert exactly one succeeds in each pair.

### Stripe: manual-capture PaymentIntent, no platform funds

`stripeService.js` wraps Stripe test-mode with capture_method: "manual". Auth
(payment_intent.succeeded) -> payment_held. Capture only on released. Cancel only on
refunded. SDK version pinned ^17.0.0.

### Webhook raw body ordering

app.js mounts webhook with `express.raw({type:"application/json"})` before global
express.json() — preserves Buffer for stripe.webhooks.constructEvent. Missing/invalid
signature returns 400 before any business logic.

### Webhook idempotency via atomic state match

handlePaymentSucceeded calls transitionOrder matching on status:"created". After first
success, order is in payment_held, second findOneAndUpdate returns null. No separate
dedup table needed.

### Seller cannot trigger release — enforced at transition-table level

No TRANSITIONS entry where whoCanTrigger includes "seller" and to is "released".
tests/escrow/escrow.test.js includes explicit "Seller cannot trigger release" test.

### Auto-release: lazy check on read, not scheduled job

getOrder/listOrders checks if delivered-order hold window expired, atomically
transitions to released. No scheduler, no double-fire risk. Hold duration by seller
tier: trusted=3d, verified=7d, unverified=14d.

### Escrow audit trail: separate EscrowEvent collection

AuditLog requires User actor/subject refs. EscrowEvent has orderId, fromStatus,
toStatus, triggeredBy (nullable), triggerType (buyer/seller/admin/system/webhook),
reason, metadata (Mixed — stores Stripe event IDs). Every transition writes a row.

### Dispute freezes auto-release structurally

Auto-release only runs on orders in "delivered". Dispute transitions to "disputed"
(removes from delivered path). Admin resolves to refunded or released.

### Rollback on failed payment capture

If stripeService.createPaymentIntent throws, inventory decrement is rolled back via
$inc: { quantity: +quantity } on Listing. Order never created.

### Admin MFA required for dispute resolution

resolve-dispute and release routes both require
[requireSession, requireRole("admin"), requireMfaVerified] — matching Phase 2 pattern.
