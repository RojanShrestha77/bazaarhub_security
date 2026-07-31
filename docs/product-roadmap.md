# BazaarHub — Product Roadmap & Feature Specification

**A secure, multi-seller online marketplace for buying and selling hardware products.**

Document type: Product & Solution Architecture specification (no implementation).
Reference marketplaces studied: Daraz, Amazon Marketplace, eBay, Jeeves, and the author's own HardwareHub and HamroDeal projects.
Audience: product, engineering, and security reviewers for a coursework submission requiring secure-by-design evidence.

---

## 0. Implementation Status (updated 2026-07-17)

Backend modules delivered so far, each with its own passing test suite (315 tests total, 38 suites):

| Feature | Status | Key endpoints |
|---|---|---|
| Auth, MFA, RBAC, sessions, audit logging | ✅ Done | `/api/auth/*` |
| **Email verification + sensitive-action gate** | ✅ Done | `POST /api/auth/email/verify`, resend |
| Profiles, data export | ✅ Done | `/api/profiles/*` |
| **Account deletion / erasure** | ✅ Done | `DELETE /api/profiles/me` |
| Listings, categories, images, search | ✅ Done | `/api/listings/*` |
| Cart, checkout, escrow, disputes | ✅ Done | `/api/cart`, `/api/escrow/*` |
| **Buyer order cancellation** | ✅ Done | `POST /api/escrow/orders/:id/cancel` |
| **Reservation expiry sweep + webhook idempotency** | ✅ Done | (internal) |
| Seller verification / application | ✅ Done | `/api/seller/*`, `/api/verification/*` |
| Admin dashboard, dispute resolution | ✅ Done | `/api/admin/*` |
| **Reviews & ratings (verified-purchase)** | ✅ Done | `/api/listings/:id/reviews` |
| **Seller rating badge** | ✅ Done | on public profile |
| **Wishlist** | ✅ Done | `/api/wishlist/*` |
| **Buyer–seller messaging** | ✅ Done | `/api/conversations/*` |
| **Buyer address book** | ✅ Done | `/api/addresses/*` |

Security fixes from the Phase-4 re-review (SA-05 MFA takeover, SA-06 X-Forwarded-For spoof, SA-07 stock leak, SA-08 webhook idempotency) are all fixed and regression-tested — see `pentest-report.md`.

**Not yet built** (see phases below): notifications, shipping/tracking, returns/refunds (RMA), coupons/promotions, seller analytics/payouts, CMS pages, support tickets, plus all Phase-3 and enterprise items.

---

## 1. Product Overview

### 1.1 Problem statement
Buyers of hardware products (power tools, components, industrial and DIY equipment) in the local market lack a trustworthy, single destination where they can compare sellers, verify product authenticity, pay safely, and resolve disputes. Sellers — often small hardware shops — lack an affordable channel to reach customers online with inventory, order, and payout management. Existing generic marketplaces under-serve the hardware vertical: they lack spec-driven filtering (voltage, dimensions, compatibility), verified-seller trust signals, and buyer-protection suited to higher-value tools.

### 1.2 Who benefits and how
- **Customers** get verified sellers, spec-accurate search, buyer-protection via escrow, and transparent dispute resolution.
- **Sellers** get storefront, inventory, order, and payout tooling with tiered trust that rewards good behaviour.
- **Platform operator** gets commission revenue, moderation control, and an auditable, defensible security posture.

### 1.3 What makes it meaningful and differentiated
- **Escrow-backed buyer protection** with tier-based hold durations (trusted sellers release faster) — a genuine trust mechanism, not just a payment gateway.
- **Hardware-specific catalog model** — structured technical specifications as first-class, filterable attributes.
- **Secure-by-design** throughout: explicit authorization on every route, MFA, audit logging, and a documented threat model.

### 1.4 Emerging / sustainable practices to weave in
Containerised reproducible environments; passwordless (magic-link / passkey) auth; privacy-by-design data export/erasure; optional local-pickup and consolidated-shipping options to reduce delivery emissions; refurbished/second-hand hardware category to extend product lifecycle.

---

## 2. User Roles

| Role | Summary |
|---|---|
| **Guest** | Unauthenticated visitor; can browse, search, view listings. |
| **Customer (Buyer)** | Registered user; can purchase, review, message, dispute, manage profile. |
| **Seller** | Buyer who has been approved to list and sell; has a dashboard, inventory, orders, payouts. Tiered: unverified → verified → trusted. |
| **Delivery / Logistics** | Handles fulfilment status updates and delivery tracking (may be third-party). |
| **Support Agent** | Handles tickets, assists in disputes, limited admin scope. |
| **Admin** | Full platform control: moderation, seller approval, dispute resolution, configuration. Should be least-privilege sub-roles where possible. |

---

## 3. Feature Roadmap

Each feature lists: description · why it matters · roles · priority.

Priority legend: **Critical** (launch-blocking) · **High** · **Medium** · **Low**.

---

## PHASE 1 — MVP (Required for Launch)

### 3.1 Authentication & User Accounts

| Feature | Description | Why it matters | Roles | Priority |
|---|---|---|---|---|
| Secure registration & login | Email + password with strong hashing (Argon2id), email uniqueness, generic responses to avoid account enumeration. | Foundation of all access. | All | Critical |
| Multi-Factor Authentication (TOTP) | Optional/required TOTP with recovery codes; enrolment protected against re-enrolment hijack. | Coursework requirement + protects high-value accounts. | Customer, Seller, Admin | Critical |
| Brute-force protection | Per-IP rate limiting, per-account exponential backoff/lockout, CAPTCHA on register/login. | Prevents credential stuffing. | All | Critical |
| Password policy & feedback | Min length, complexity, reuse prevention (history), strength meter, optional expiry. | Coursework requirement; account security. | All | Critical |
| Secure session management | HttpOnly + Secure + SameSite cookies, `__Host-` prefix, sliding + absolute expiry, revocation, logout-all. | Prevents hijack/fixation. | All | Critical |
| Password reset (email token) | Single-use, expiring, hashed tokens; invalidates sessions on reset. | Account recovery without support. | All | Critical |
| Email verification | Confirm ownership before selling/purchasing. | Reduces fraud & spam accounts. | Customer, Seller | High |
| Role-Based Access Control | Least-privilege gates on every route; roles buyer/seller/admin + seller tiers. | Coursework requirement; core security. | All | Critical |

### 3.2 Customer Profiles

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Profile management | View/edit name, contact, avatar; explicit field allow-list (no mass assignment). | Personalisation + IDOR/privilege-escalation defence. | Customer, Seller | Critical |
| Address book | Multiple saved shipping addresses. | Faster checkout. | Customer | High |
| Data export (privacy) | Download personal data (GDPR-style). | Coursework privacy requirement. | Customer, Seller | High |
| Account deletion / erasure | Request deletion / anonymisation. | Privacy compliance. | Customer | Medium |

### 3.3 Product Management & Catalog

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Product listings (CRUD) | Sellers create/edit/deactivate listings: title, description, price, quantity, category, specs. | Core marketplace supply. | Seller, Admin | Critical |
| Product categories | Hierarchical hardware categories (tools, fasteners, electrical…). | Navigation & filtering. | Admin, Seller | Critical |
| Product images | Multiple images per listing; secure upload (type/size validation, re-encode, no path traversal). | Conversion + secure-upload requirement. | Seller | Critical |
| Inventory / stock | Quantity tracking with atomic decrement at checkout (no overselling). | Order integrity. | Seller | Critical |
| Listing moderation | Admin can review/suspend listings. | Prevents illegal/counterfeit goods. | Admin | High |

### 3.4 Discovery

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Search | Keyword search across title/description. | Primary discovery path. | All | Critical |
| Filters & sort | Filter by category, price, availability, seller tier; sort by price/newest. | Hardware buyers filter heavily. | All | Critical |
| Listing detail page | Full spec, images, seller trust badge, stock, reviews. | Purchase decision. | All | Critical |

### 3.5 Cart, Checkout & Orders

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Shopping cart | Add/update/remove items; server-side validation of price & stock. | Standard purchase flow. | Customer | Critical |
| Checkout | Address selection, order summary, price recomputed server-side. | Prevents price tampering. | Customer | Critical |
| Order creation & lifecycle | State machine: created → paid/held → shipped → delivered → released; immutable event log. | Core transaction integrity. | Customer, Seller, Admin | Critical |
| Order history | Buyers and sellers view their orders and statuses. | Transparency. | Customer, Seller | Critical |

### 3.6 Payments

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Payment gateway integration | Trusted third-party (Stripe / Khalti / eSewa); no card data touches the app. | Coursework "trusted third-party" + PCI scope reduction. | Customer | Critical |
| Escrow / payment hold | Funds held until buyer confirms delivery or hold window expires; tier-based durations. | Buyer protection differentiator. | Customer, Seller, Admin | Critical |
| Webhook signature verification | Verify gateway webhooks (raw-body signature), idempotent event handling. | Prevents forged payment confirmations. | System | Critical |
| Refund / cancel handling | Cancel/refund on dispute resolution with rollback of stock. | Transaction rollback requirement. | Admin, System | Critical |

### 3.7 Trust, Safety & Security Infrastructure

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Input validation everywhere | Schema validation (Zod) on all inputs; typed DTOs. | Injection/logic-flaw defence. | System | Critical |
| CSRF protection | Double-submit token on state-changing authenticated routes. | Coursework requirement. | System | Critical |
| XSS prevention | Output encoding, CSP headers, sanitised rich text. | Coursework requirement. | System | Critical |
| Injection prevention | Parameterised queries / ODM; no string-built queries; NoSQL-injection guards. | Data integrity. | System | Critical |
| Audit logging | Meaningful security events (auth, authz failures, admin actions) without sensitive data; redacted logs. | Coursework requirement; incident response. | Admin/System | Critical |
| Error handling | No stack traces or internal detail leaked; generic 500s. | Information-disclosure defence. | System | Critical |
| Secure headers | Helmet/CSP, HSTS, frameAncestors none, etc. | Baseline hardening. | System | Critical |
| Seller verification (KYC-lite) | Sellers submit documents; admin approves → tier upgrade. | Trust + fraud reduction. | Seller, Admin | Critical |

### 3.8 Admin (MVP subset)

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Admin dashboard | Approve sellers, resolve disputes, view audit logs, suspend users/listings. | Platform operability. | Admin | Critical |
| Dispute resolution | Admin releases or refunds escrow; MFA-gated. | Buyer/seller trust. | Admin | Critical |

---

## PHASE 2 — High Priority

### Reviews, Messaging & Engagement

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Product reviews & ratings | Verified-purchase reviews with moderation; seller ratings. | Trust & conversion; standard on Daraz/Amazon/eBay. | Customer, Seller, Admin | High |
| Buyer–Seller messaging | In-platform threaded messaging (pre/post sale), abuse-reportable. | Reduces off-platform fraud. | Customer, Seller | High |
| Wishlist / favourites | Save items for later. | Retention & re-marketing. | Customer | Medium |
| Notifications | Email + in-app for order status, messages, disputes; user preferences. | Engagement + transactional clarity. | All | High |

### Fulfilment & Post-Purchase

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Shipping options & rates | Seller-configured shipping methods/zones; local pickup. | Accurate delivery cost. | Seller, Customer | High |
| Delivery tracking | Status updates, tracking number, delivery-agent updates. | Post-purchase transparency. | Customer, Seller, Delivery | High |
| Returns & refunds (RMA) | Structured return requests with reasons, approval flow. | Consumer-protection expectation. | Customer, Seller, Admin | High |
| Coupons & promotions | Percentage/fixed discounts, codes, seller/platform-funded, usage limits. | Conversion & marketing. | Seller, Admin, Customer | High |

### Seller & Admin Depth

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Seller dashboard analytics | Sales, revenue, top products, payout status. | Seller retention. | Seller | High |
| Payout management | Track seller balances, commission deduction, payout scheduling. | Core marketplace economics. | Seller, Admin | High |
| Reports & analytics (admin) | GMV, orders, disputes, fraud signals. | Business operations. | Admin | High |
| Moderation queue | Reported listings/reviews/messages workflow. | Trust & safety at scale. | Admin, Support | High |
| Product variants | Size/colour/spec variants under one product (e.g. drill kits). | Cleaner catalog; standard on Amazon/eBay. | Seller | High |

### Platform Quality

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| CMS pages | Terms, privacy, FAQ, help articles. | Legal + trust. | Admin | High |
| Customer support / tickets | Support inbox, ticket lifecycle. | Retention & compliance. | Customer, Support, Admin | High |
| SEO | Clean URLs, meta tags, sitemaps, structured data. | Organic acquisition. | System | High |
| Accessibility (WCAG 2.1 AA) | Keyboard nav, contrast, ARIA, screen-reader testing. | Coursework requirement; inclusivity. | All | High |
| Mobile responsiveness | Fully responsive UI. | Majority of marketplace traffic is mobile. | All | High |
| Logging & monitoring | Centralised logs, health checks, alerting on anomalies. | Coursework monitoring requirement. | Admin/System | High |

---

## PHASE 3 — Nice to Have

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Passwordless / passkey (WebAuthn) | Biometric/passkey login beyond magic-link. | Advanced auth (coursework bonus). | All | Medium |
| Q&A on listings | Public buyer questions + seller answers. | Reduces support load; eBay/Amazon staple. | Customer, Seller | Medium |
| Recommendations | "Related / frequently bought together". | AOV uplift. | Customer | Medium |
| Recently viewed & browsing history | Personalised re-engagement. | Retention. | Customer | Low |
| Flash sales / campaigns | Time-boxed platform events (Daraz-style). | Demand spikes. | Admin, Seller | Medium |
| Multi-image zoom / video | Rich media on listings. | Conversion for tools. | Seller | Low |
| Saved searches & alerts | Notify when matching items appear. | eBay-style buyer retention. | Customer | Low |
| Referral programme | Invite credits. | Growth loop. | Customer | Low |
| Bulk listing import (CSV) | Sellers upload catalogs. | Seller onboarding at scale. | Seller | Medium |
| Refurbished/second-hand category | Condition grading. | Sustainability + eBay parity. | Seller, Customer | Medium |

---

## FUTURE / Enterprise Features

| Feature | Description | Why | Roles | Priority |
|---|---|---|---|---|
| Multi-currency & multi-language (i18n) | Localised catalog and pricing. | Cross-border expansion. | All | Low |
| Advanced fraud detection | ML/rules scoring on orders, chargeback prediction. | Loss prevention at scale. | Admin/System | Low |
| Seller sub-accounts & staff roles | Granular seller-side RBAC. | Larger sellers. | Seller | Low |
| Open API / developer platform | Public API + keys for integrators/ERPs. | Ecosystem. | Seller, Partner | Low |
| Advertising / sponsored listings | Paid placement auction. | Revenue diversification (Amazon model). | Seller, Admin | Low |
| Warehouse/fulfilment (FBA-style) | Platform-operated logistics. | Service tier. | Admin, Delivery | Low |
| Loyalty / rewards programme | Points, tiers. | Retention. | Customer | Low |
| B2B / bulk-quote (RFQ) | Request-for-quote for trade buyers. | Hardware-vertical fit. | Customer, Seller | Low |
| Data warehouse & BI | Dedicated analytics pipeline. | Enterprise reporting. | Admin | Low |
| Disaster recovery / multi-region | HA, geo-redundant backups. | Enterprise resilience. | System | Low |

---

## 4. Security Requirements Mapping (Secure-by-Design)

This maps the coursework security checklist to concrete platform features. These are **requirements woven across all phases**, not standalone features.

| Security area | Design commitment |
|---|---|
| **Authentication** | Argon2id hashing; TOTP MFA + recovery codes; magic-link/passwordless; generic error responses to prevent enumeration; email verification. |
| **Authorization (RBAC)** | Least-privilege gate on every route; role + seller-tier axes read fresh per request; ownership checks resolve resources server-side (IDOR defence); router refuses any route lacking an explicit authz declaration. |
| **Input validation** | Schema validation (Zod) + typed DTOs on every endpoint; ObjectId/param validation; reject unknown fields. |
| **Secure file uploads** | MIME/type + size limits, extension allow-list, image re-encoding, randomised stored filenames, out-of-webroot storage, no path traversal. |
| **CSRF** | Double-submit cookie token on authenticated state-changing routes; SameSite=Lax as defence-in-depth. |
| **XSS** | Output encoding, strict CSP, sanitisation of any rich text, HttpOnly session cookie. |
| **Injection (SQL/NoSQL)** | Parameterised queries / ODM only; never build queries from raw input; guard object-shaped query injection. |
| **Rate limiting & throttling** | Per-endpoint IP limiters; per-account backoff; trust only proxy-validated client IP (never raw `X-Forwarded-For` for allow-listing). |
| **Session security** | `__Host-` prefixed, HttpOnly, Secure, SameSite cookies; sliding + absolute expiry; server-side revocation; logout-all; optional user-agent/device binding. |
| **Password hashing** | Argon2id with tuned cost; reuse-prevention history; optional expiry; strength feedback. |
| **Audit logging** | Structured security events with actor/IP/UA/metadata; sensitive data redacted; supports incident response. |
| **Error handling** | Central handler; no stack traces or internal detail to clients; consistent generic messages. |
| **Secure API design** | Consistent status codes, no verb tampering, idempotent webhooks, versionable routes, no over-fetching of other users' data. |
| **Privacy** | Data-minimisation, export & erasure, purpose-limited retention, encryption of sensitive-at-rest fields (e.g. TOTP secrets), documented key management. |
| **Encryption & key management** | TLS in transit; encrypt sensitive fields at rest; secrets from environment/secret store, never in code; documented rotation. |
| **Backup & recovery** | Scheduled DB backups, tested restore procedure, retention policy. |
| **Configuration management** | Env-based config, `.env.example`, no secrets in VCS, containerised reproducible environments, CI/CD with automated security checks (dependency audit, SAST, secret scanning). |

---

## 5. Module Coverage Checklist

Confirming every requested marketplace area is addressed and where:

| Module | Phase | Module | Phase |
|---|---|---|---|
| Authentication & User Accounts | P1 | Delivery Tracking | P2 |
| Customer Profiles | P1 | Returns & Refunds | P2 |
| Seller Dashboard | P1 (basic) / P2 (analytics) | Coupons & Promotions | P2 |
| Admin Dashboard | P1 | Search | P1 |
| Product Management | P1 | Filters | P1 |
| Product Categories | P1 | Notifications | P2 |
| Inventory Management | P1 | Buyer–Seller Messaging | P2 |
| Product Variants | P2 | Reports & Analytics | P2 |
| Product Images | P1 | Moderation | P1 (basic) / P2 (queue) |
| Reviews & Ratings | P2 | CMS Pages | P2 |
| Wishlist | P3 | Customer Support | P2 |
| Shopping Cart | P1 | SEO | P2 |
| Checkout | P1 | Performance | Cross-cutting |
| Orders | P1 | Accessibility | P2 |
| Payments | P1 | Mobile Responsiveness | P2 |
| Shipping | P2 | Logging & Monitoring | P1/P2 |
| Backup & Recovery | Cross-cutting | Configuration Management | Cross-cutting |

---

## 6. Gap Analysis — Features Common on Daraz / HamroDeal / Amazon / eBay

Features frequently present on the reference marketplaces that were **not explicit** in the original module list, with a recommendation:

| Feature | Seen on | Recommendation |
|---|---|---|
| **Verified-purchase reviews + seller feedback score** | All | **Include (P2).** Core trust signal; distinguishes credible reviews. |
| **Q&A / product questions** | Amazon, eBay, Daraz | **Include (P3).** Cuts pre-sale support load. |
| **Seller ratings & storefront pages** | All | **Include (P2).** Sellers need a branded storefront and reputation. |
| **Cash-on-Delivery (COD)** | Daraz, HamroDeal | **Consider (P2).** Dominant in the local market; but complicates escrow — offer as an alternative flow with its own risk controls. |
| **Wallet / store credit** | Daraz, Amazon | **Consider (P3).** Useful for refunds-as-credit and faster checkout. |
| **Buyer/Seller protection policy & dispute SLA** | eBay, Amazon | **Include (P1/P2).** Already partly covered by escrow; formalise as policy pages. |
| **Order cancellation before shipment** | All | **Include (P2).** Common expectation; needs stock rollback + refund. |
| **Price comparison / multiple sellers per product (catalog vs listing)** | Amazon | **Consider (Future).** Amazon's shared-catalog model is complex; eBay/Daraz listing-centric model (current design) is simpler and fine for MVP. |
| **Flash sales / daily deals** | Daraz | **Include (P3).** Strong demand driver in this region. |
| **Vouchers/coupons stacking rules** | Daraz | **Include (P2)** as part of promotions. |
| **Live chat / support bot** | Daraz, Amazon | **Consider (P3).** Ticket system first (P2), live chat later. |
| **Push notifications (mobile/web)** | All | **Include (P2/P3)** alongside email/in-app. |
| **Fraud/chargeback controls** | Amazon, eBay | **Include (Future).** Start with rules, evolve to scoring. |
| **Multi-language / multi-currency** | Amazon, eBay | **Future.** Not needed for a single-market launch. |
| **Sponsored/ad placements** | Amazon, Daraz | **Future.** Revenue play once liquidity exists. |
| **Delivery-partner role & app** | Daraz, HamroDeal | **Include (P2).** Already have a Delivery role; give them a status-update surface. |

### Notable omissions worth flagging
- **Cash-on-Delivery** is the single most impactful market-specific feature missing — in the Daraz/HamroDeal context, a large share of buyers expect it. Recommend designing an alternative COD order flow (with delivery-agent confirmation replacing gateway webhook) in Phase 2.
- **Order cancellation** and **wallet/store-credit refunds** round out the post-purchase experience and should not be deferred too far.

---

## 7. Suggested Delivery Sequence (build order)

1. **Foundations:** auth, RBAC, sessions, profiles, security middleware, audit logging, containerised env + CI security checks.
2. **Catalog & discovery:** categories, listings, images, search, filters.
3. **Transaction core:** cart, checkout, orders, payment gateway, escrow, webhooks, refunds.
4. **Trust:** seller verification/tiers, admin dashboard, dispute resolution, moderation.
5. **Engagement (P2):** reviews, messaging, notifications, shipping/tracking, returns, promotions, seller analytics, payouts.
6. **Quality (P2):** SEO, accessibility, responsiveness, CMS, support, monitoring.
7. **P3 & Enterprise** as growth/scale demands.

---

*End of specification. No implementation code included, per scope.*
