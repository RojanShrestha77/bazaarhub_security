import nodemailer from "nodemailer";
import { SMTP_HOST, SMTP_PORT, MAIL_FROM, EMAIL_USER, EMAIL_PASS } from "../configs";

// SMTP client wiring only — no email content lives here.
// When Gmail credentials are configured (EMAIL_USER + EMAIL_PASS), send real
// mail through Gmail. Otherwise fall back to the local SMTP host (MailHog in
// dev; caught mail at http://localhost:8025, never delivered externally).
// NODE_ENV==="test" always uses the local fallback so the test suite can never
// send real email through Gmail.
const useGmail = Boolean(EMAIL_USER && EMAIL_PASS) && process.env.NODE_ENV !== "test";

export const transporter = useGmail
  ? nodemailer.createTransport({ service: "gmail", auth: { user: EMAIL_USER, pass: EMAIL_PASS } })
  : nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: false });

export { MAIL_FROM };
