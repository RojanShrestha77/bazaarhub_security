# Threat Model — BazaarHub Authentication

> Draft analysis, not final copy. This is scaffolding for you to argue with, correct,
> and rewrite in your own words before it's a real doc. Anywhere you disagree with a
> severity, an assumption, or a mitigation, that's a signal to dig in, not to accept it.
> Open questions are marked `[Q]` — decide and delete them as you go.

## Scope

Covers authentication surface only: registration, login/logout, session
management, TOTP MFA (enrolment, verification, recovery codes), rate
limiting/lockout/CAPTCHA, password policy. Explicitly **out of scope** for this
phase: authorization/RBAC after a session exists, payment/escrow logic, seller
verification workflow content, product listing integrity. Those have their own
trust boundaries and should get their own threat model passes later — don't let
this doc balloon into "all of BazaarHub."

`[Q]` Confirm this scope boundary is where you want it. Session management touches
authorization at the edges (e.g., "does changing password/role require session
invalidation" — that's arguably both). I've put session *lifecycle* here and
*permission checks* out of scope.

## Assets

Ranked roughly by what an attacker gains, not by how they'd get it:

1. **Seller accounts** — control of a seller account lets an attacker redirect
   payouts, alter listings (fraud, counterfeit, bait-and-switch), or harvest
   buyer data through the seller's own dashboard. Higher value than a single
   buyer account because sellers are a smaller, richer target set.
2. **Buyer accounts** — stored payment methods/addresses, order history, and
   whatever the escrow flow exposes (dispute evidence, PII). Also a pivot
   point: a buyer account can be used to file fraudulent disputes against
   sellers.
3. **Session tokens / cookies** — bearer of both of the above. If session
   theft is trivial, the account itself doesn't need to be "breached" in any
   meaningful sense.
4. **Password hashes** (at rest) — offline cracking risk, plus credential
   reuse against other services if hashing is weak.
5. **TOTP secrets** — if these leak, MFA is void for every affected account
   simultaneously; this is a "break glass" asset, treat leak of this table as
   equivalent to MFA never having existed.
6. **Recovery codes** (hashed at rest, presumably) — same blast radius as TOTP
   secrets if hashing/storage is weak, plus a bypass path that skips TOTP
   entirely.
7. **Admin/internal accounts** — not explicitly in your model list yet, but
   any admin panel or support tooling that can reset a user's MFA or password
   is itself an asset and a trust boundary. `[Q]` Does BazaarHub have an admin
   role yet? If so it belongs explicitly in this doc, because "support resets
   MFA for a locked-out user" is a classic social-engineering target.
8. **Rate-limit/lockout state** — availability asset. If cheap to exhaust,
   it's a DoS lever against a specific seller (see lockout discussion below).

## Trust Boundaries

```
[ Attacker-controlled browser/script ]
              |  (untrusted input, cookies, localStorage if used)
              v
[ nginx :3000 — static frontend, TLS termination point in prod ]
              |
              v
[ Express API :5000 ] <-- trust boundary: everything crossing here is
              |            untrusted until validated/authenticated
              v
[ MongoDB :27017 ]  <-- trust boundary: app is the only legitimate caller;
                         DB itself has no notion of "this is the auth service"
```

Boundaries that matter specifically for auth:

- **Browser ↔ API**: the big one. Every auth endpoint is attacker-reachable
  with no prior trust. This is where STRIDE below is concentrated.
- **API ↔ DB**: Mongo has no row-level auth concept relevant here — the app
  is trusted fully. If Mongo is ever reachable directly (misconfigured
  network, exposed port in a bad docker-compose profile, NoSQL injection from
  the API layer), that boundary collapses. `docker-compose.yml` binds 27017
  to `127.0.0.1` only (not `0.0.0.0`) — kept for Compass access during dev —
  and Mongo now requires authentication regardless of network position, since
  loopback binding is host-level convenience, not an access control: anything
  else running on the same machine, or a container that later joins the host
  network, could otherwise reach it unauthenticated. Note that the backend
  itself never used the host port mapping — it reaches Mongo over the compose
  network by service name (`mongo:27017`), so the mapping exists purely for
  the developer's own tooling, not for any in-app path.
- **API ↔ TOTP secret store**: same DB, but conceptually a *harder* boundary
  than "just another user field" — see design decision #4 below. If you land
  on envelope encryption, the boundary is really "API ↔ KMS/key," not "API ↔
  Mongo."
- **Session validation boundary**: wherever "is this request authenticated"
  gets decided (middleware). Every route added later inherits whatever this
  phase gets wrong, so bugs here are multiplicative.

## Attacker Personas

Marketplace-specific, not generic "hacker":

1. **Credential stuffer** — runs leaked username/password lists against
   login. Doesn't care which account, wants volume. Primary signal: many
   distinct accounts, low attempts per account, high velocity. This is the
   persona that most directly argues for per-IP + per-account rate limiting,
   CAPTCHA, and breach-password checking (haveibeenpwned range API) at
   registration/password-change time.
2. **Malicious/compromised seller** — either a legitimate seller acting in
   bad faith, or an attacker who has taken over a real seller account.
   Threat here isn't "get in," it's "stay in and look normal" — session
   longevity, lack of anomaly detection on login (new device/geo), and
   whether MFA re-prompts on sensitive actions (payout address change, bulk
   listing edit) all matter more than for a buyer.
3. **Buyer trying to escalate** — targets IDOR/business-logic flaws to act as
   a seller or admin, or to view another buyer's orders. Mostly out of scope
   for *this* phase (authorization), but touches auth where session/JWT
   claims are trusted for role info — if role is embedded in a token and not
   re-checked server-side per request, this persona wins immediately.
4. **Insider / support-tool abuser** — someone with legitimate access to an
   admin or support panel uses it beyond its intent: resets MFA for an
   account they don't own, reads plaintext-recoverable secrets, or issues
   themselves a session for another user ("impersonate for support"
   features are a common source of this). Requires this doc to eventually
   cover admin-initiated account recovery flows explicitly, even though
   general RBAC is out of scope — the auth *side effects* of admin actions
   (session invalidation, audit logging, step-up auth for the admin) are in
   scope.
5. **Passive network/log observer** — anyone who can read logs, browser
   history, or proxy traffic. Relevant to: tokens in URLs, verbose error
   messages logged with credentials, TOTP codes or recovery codes ending up
   in server access logs via query strings.

6. **Support/admin insider** — MFA reset tooling and any account-recovery
   override an admin/support role can trigger is a privilege-escalation
   path in its own right (see persona 4 above and Trust Boundaries). Parked
   here as a placeholder; model in Phase 2 once the admin/support role
   exists.

`[Q]` Is there a "malicious buyer colluding with a malicious seller" scenario
worth naming (e.g., account takeover used to manufacture fake positive
reviews or fraudulent escrow releases)? Probably belongs in the
escrow-specific threat model rather than here, flagging so it doesn't get
lost.

## STRIDE Applied to Auth Flows

### Spoofing
- Login with stolen/guessed credentials (credential stuffer, persona 1).
- Session token theft via XSS → attacker spoofs the legitimate session
  without ever knowing the password. This is *the* reason session
  storage/cookie flags (design decisions #1–2) matter more than password
  strength in practice.
- TOTP spoofing: SIM-swap style attacks don't apply (TOTP isn't SMS), but a
  stolen/duplicated TOTP secret (from a DB leak or a bad QR-code display
  path, e.g. secret logged or sent over unencrypted channel during
  enrolment) lets an attacker generate valid codes indefinitely.
- Recovery-code spoofing if codes are predictable (weak RNG) or reused.

### Tampering
- Client-side tampering with anything trusted from the request: role claims
  in a JWT payload, a "mfa_verified" flag sent from client instead of derived
  server-side, hidden form fields.
- Mass assignment on the registration/profile endpoints — client sends
  `{ "role": "admin" }` or `{ "isVerifiedSeller": true }` and the model binds
  it blindly. Explicitly called out in your Step 4 review checklist; noting
  it here too because it's a Tampering threat, not just a code-quality issue.
- Tampering with password-reset tokens (predictable tokens, or tokens not
  bound to the specific user/email they were issued for).

### Repudiation
- Login/logout/password-change/MFA-enrolment events need audit logging with
  enough context (timestamp, IP, user-agent, outcome) that a user or admin
  can later answer "was this me?" Currently no logging story mentioned —
  `[Q]` worth deciding now whether auth events go to the same log pipeline as
  everything else or need tamper-evident handling (e.g., because they're the
  evidence trail for account-takeover disputes, which in a marketplace with
  escrow can have real money attached).
- Recovery-code use should be logged distinctly from normal TOTP use —
  "someone used a recovery code" is a stronger anomaly signal than a normal
  login and should probably notify the user.

### Information Disclosure
- **User enumeration** — registration ("email already exists"), login
  ("wrong password" vs "no such user"), and password reset ("if that email
  exists...") are the classic three leak points. You've already flagged this
  for Step 2 discussion; noting here that timing is the sneaky fourth leak —
  even identical response bodies can leak existence via response-time
  differences (e.g., hashing a real stored hash vs. skipping hashing
  entirely for a nonexistent user). This needs a deliberate fix (dummy hash
  work on the non-existent path), not just identical error strings.
- TOTP secret or recovery codes appearing in logs, error messages, or
  API responses they shouldn't (e.g., secret returned again on a "resend QR"
  endpoint after initial enrolment).
- Verbose stack traces or DB error messages reaching the client in
  production (Express default error handler does this if not overridden —
  worth checking `backend/src/server.js` has an error handler before this
  phase ships).
- MongoDB port exposed to host (see Trust Boundaries) is an information
  disclosure risk if the host is ever multi-tenant or the compose file used
  as-is in a shared environment.

### Denial of Service
- **Lockout-as-DoS**: an attacker locks a target seller out right before a
  sale event by deliberately failing their login N times. This is the
  headline tension for design decision #6 — per-account lockout is the
  obvious naive answer and is also the DoS vector.
- CAPTCHA/rate-limit infrastructure itself becoming a bottleneck (e.g.,
  synchronous calls to a third-party CAPTCHA verify endpoint on the hot
  login path with no timeout).
- MFA verify endpoint without its own rate limit: even if login is
  protected, an attacker who has a stolen password can hammer the 6-digit
  TOTP code (1,000,000 possibilities is small enough to brute-force without
  a rate limit) — this is explicitly called out in your Step 4 checklist,
  restating here because it's also a DoS/Spoofing threat, not just a missing
  rate limit.

### Elevation of Privilege
- Session fixation: attacker sets/knows a session identifier before login,
  victim authenticates, attacker reuses the now-privileged session. Requires
  session ID regeneration on privilege change (login, and arguably on
  MFA-verify completing a step-up).
- Missing re-authentication for sensitive actions — e.g., changing the
  account email or payout details without re-entering password/MFA lets a
  hijacked-but-not-fully-owned session (e.g., stolen via a narrow XSS
  window) escalate to full account takeover.
- Privilege escalation via role tampering (see Tampering above) — the same
  bug shows up in two STRIDE categories because it *is* both.

## Relevant OWASP Top 10 (2021) Categories

- **A01 Broken Access Control** — session/role trust boundary failures
  (elevation-of-privilege items above).
- **A02 Cryptographic Failures** — password hashing choice/params (decision
  #3), TOTP secret encryption at rest (decision #4), any plaintext secrets
  in transit or logs.
- **A04 Insecure Design** — this whole exercise is trying to front-run this
  category: lockout-as-DoS, enumeration-by-design, MFA without rate limiting
  are all design-level, not implementation-level, if not caught now.
- **A05 Security Misconfiguration** — verbose errors, exposed Mongo port,
  missing cookie flags, permissive CORS on auth endpoints.
- **A07 Identification and Authentication Failures** — the category that's
  almost literally this document: weak password policy, missing MFA
  brute-force protection, session fixation, credential stuffing defenses.
- **A09 Security Logging and Monitoring Failures** — the Repudiation section
  above.

## Relevant OWASP ASVS v4 Requirements (selected, V2/V3 chapters)

Not exhaustive — pulling the ones most likely to bite in this specific
implementation:

- **V2.1** Password security: length over complexity, no forced periodic
  rotation, check against breached-password lists.
- **V2.2** General authenticator: resistance to credential stuffing
  (rate limiting/lockout), no user enumeration.
- **V2.3** Authenticator lifecycle: secure recovery-code/MFA
  enrolment and revocation flows.
- **V2.5** Credential recovery: no leaking existence, recovery tokens
  single-use and time-bound.
- **V2.8** One-time verifier (TOTP): secret generated with sufficient
  entropy, resistant to replay within the same window, rate-limited.
- **V3.2/V3.3** Session binding and termination: session IDs regenerated on
  auth state change, invalidated server-side on logout ("logout everywhere"
  ties directly into decision #1).
- **V3.4** Cookie-based session management: `Secure`, `HttpOnly`,
  `SameSite`, and ideally `__Host-` prefix — directly maps to your Step 4
  review checklist.

`[Q]` Worth deciding now whether you're going to *track* ASVS level (1/2/3)
formally per requirement in this doc, or just use it as a checklist during
review. For a marketplace handling payments I'd lean toward at least ASVS
Level 2 as the target, but that's your call and affects how much rigor
decision #3–5 need.

## Attack Scenarios (concrete, to sanity-check the abstract analysis above)

1. Attacker buys a breached credential list, runs it against `/login` at
   low volume per account, high volume overall → succeeds against reused
   passwords unless rate limiting is per-IP *and* the password isn't in a
   breach list.
2. Attacker finds a stored-XSS in a product review field (out of scope to
   fix here, but relevant as an *input* to auth) → steals session token if
   it's in `localStorage` or a non-`HttpOnly` cookie → full account takeover
   with no password or MFA needed at all.
3. Competitor seller wants to knock a rival off the platform during a sale
   → deliberately fails login 10x → account locked for the lockout window
   → measurable revenue loss for the victim. Success/failure of this attack
   is entirely determined by decision #6.
4. Attacker has a target's password (phished separately) but not their
   phone → hammers `/mfa/verify` with all 1,000,000 TOTP codes → succeeds
   within minutes if that endpoint has no independent rate limit, regardless
   of how good login rate limiting is.
5. Attacker registers with the victim's email → gets "email already
   registered" → now knows the victim has an account, and can pivot to
   scenario 1 or password-reset enumeration to build a target list.

## Mitigations Summary

Deliberately left mostly blank — this table should be filled in *after* you
make and record the decisions in Step 2, not before. Prefilling it now would
be me deciding your architecture, which is exactly what this phase says I
shouldn't do.

| Threat | Mitigation | Decision reference |
|---|---|---|
| Credential stuffing | TBD | decisions #6, #7 |
| Session theft via XSS | TBD | decisions #1, #2 |
| TOTP brute force | TBD | (rate limit design, Step 4) |
| DB leak exposing TOTP secrets | TBD | decision #4 |
| Recovery code reuse | TBD | decision #5 |
| User enumeration | TBD | decision #7 |
| Lockout-as-DoS | TBD | decision #6 |

## Residual Risks

Things that likely remain even after good decisions, worth stating
explicitly rather than pretending they're solved:

- No auth design eliminates phishing of the password + a live TOTP code in
  real time (real-time relay/AiTM attacks). Passkeys/WebAuthn close this;
  TOTP does not. `[Q]` Is that an acceptable residual risk for this phase,
  or does it push you toward WebAuthn as a future addition rather than TOTP
  being the ceiling?
- Insider risk from anyone with production DB or admin-panel access is not
  fully closeable by application-layer controls alone — it needs
  process/access controls outside this codebase's scope.
- Availability: even well-designed per-account+per-IP rate limiting has some
  DoS surface (see Denial of Service section) — this phase should aim to
  raise the cost of the lockout-as-DoS scenario, not claim to eliminate it.

---

*Next: Step 2, design decision #1 (session strategy). I'll present options,
tradeoffs, and reviewer questions, then stop for your call.*
