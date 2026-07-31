import { Types } from "mongoose";
import { transporter, MAIL_FROM } from "../lib/mailer";
import { FRONTEND_URL } from "../configs";
import { UserModel } from "../models/user.model";

type MailOptions = {
  to: string;
  subject: string;
  text: string;
};

// Fire-and-forget on purpose (decision #7): callers must NOT await this
// before responding — response timing correlating with "was an email
// actually queued" is itself an enumeration signal. Errors are logged,
// never thrown back into the request path.
export function sendMailAsync(options: MailOptions): void {
  transporter.sendMail({ from: MAIL_FROM, ...options }).catch((err: Error) => {
    console.error("sendMailAsync failed:", err.message);
  });
}

export function sendRegistrationConfirmation(email: string): void {
  sendMailAsync({ to: email, subject: "Welcome to BazaarHub", text: "Your BazaarHub account has been created." });
}

// Decision #7's registration-enumeration mitigation: existing addresses get
// a different notification, not a different HTTP response.
export function sendExistingAccountNotice(email: string): void {
  sendMailAsync({
    to: email,
    subject: "Someone tried to register with your email",
    text:
      "Someone just tried to create a BazaarHub account using this email address, " +
      "but you already have one. If this wasn't you, no action is needed — your " +
      "account is unaffected. If you've forgotten your password, use the password " +
      "reset link on the login page.",
  });
}

export function sendEmailVerification(email: string, token: string): void {
  const link = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  sendMailAsync({
    to: email,
    subject: "Verify your BazaarHub email address",
    text:
      "Welcome to BazaarHub! Click the link below to verify your email address " +
      "and unlock buying and selling:\n\n" +
      `${link}\n\n` +
      "This link is single-use and expires in 24 hours. If you didn't create a " +
      "BazaarHub account, you can ignore this email.",
  });
}

export function sendPasswordResetEmail(email: string, resetToken: string): void {
  const link = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  sendMailAsync({
    to: email,
    subject: "Reset your BazaarHub password",
    text:
      "Click the link below to reset your BazaarHub password:\n\n" +
      `${link}\n\n` +
      "This link is single-use and expires shortly. If you didn't request this, " +
      "you can ignore this email.",
  });
}

export function sendRecoveryCodeUsedNotice(email: string): void {
  sendMailAsync({
    to: email,
    subject: "A BazaarHub recovery code was used",
    text:
      "A recovery code was just used to sign in to your account, bypassing your " +
      "authenticator app. If this wasn't you, change your password immediately " +
      "and regenerate your recovery codes.",
  });
}

export function sendMagicLinkEmail(email: string, token: string): void {
  const link = `${FRONTEND_URL}/magic-link/verify?token=${encodeURIComponent(token)}`;
  sendMailAsync({
    to: email,
    subject: "Sign in to BazaarHub",
    text: `Use this link to sign in without a password:\n\n${link}\n\nThis link is single-use and expires in 15 minutes. If you didn't request this, you can ignore this email.`,
  });
}

export function sendPasswordExpiryWarning(email: string): void {
  sendMailAsync({
    to: email,
    subject: "Your BazaarHub password is about to expire",
    text: "Your password was last changed over 80 days ago. Please change it to continue using your account securely.",
  });
}

// ── Escrow / order / verification notifications ──
// Fire-and-forget, same as auth notifications. A mail failure must never
// fail a money transition. Accepts a userId or an email string.
type UserRef = string | Types.ObjectId;

async function resolveEmail(userIdOrEmail: UserRef): Promise<string | null> {
  if (typeof userIdOrEmail === "string" && userIdOrEmail.includes("@")) return userIdOrEmail;
  const user = await UserModel.findById(userIdOrEmail).select("email");
  return user ? user.email : null;
}

function notify(userId: UserRef, subject: string, text: string): void {
  resolveEmail(userId).then((email) => {
    if (email) sendMailAsync({ to: email, subject, text });
  });
}

export function sendPaymentReceivedNotification(userId: UserRef, orderId: string): void {
  notify(userId, "Payment received for order", `Payment received for order ${orderId}. Funds held in escrow until delivery confirmed.`);
}
export function sendOrderShippedNotification(userId: UserRef, orderId: string): void {
  notify(userId, "Order shipped", `Order ${orderId} marked shipped. Confirm delivery once received.`);
}
export function sendOrderDeliveredNotification(userId: UserRef, orderId: string): void {
  notify(userId, "Order delivered", `Order ${orderId} marked delivered. Funds release after hold period.`);
}
export function sendOrderDisputedNotification(userId: UserRef, orderId: string): void {
  notify(userId, "Order disputed", `Order ${orderId} disputed. Admin will review.`);
}
export function sendOrderReleasedNotification(userId: UserRef, orderId: string): void {
  notify(userId, "Funds released", `Funds for order ${orderId} released.`);
}
export function sendOrderRefundedNotification(userId: UserRef, orderId: string): void {
  notify(userId, "Order refunded", `Order ${orderId} refunded.`);
}
export function sendIllegalTransitionAlert(userId: UserRef, orderId: string, fromStatus: string, toStatus: string): void {
  notify(userId, "Security alert: illegal transition", `Illegal transition ${fromStatus}->${toStatus} blocked on order ${orderId}.`);
}
export function sendVerificationSubmittedNotification(userId: UserRef, requestId: string): void {
  notify(userId, "Verification request submitted", `Your verification request ${requestId} has been submitted and is pending review.`);
}
export function sendVerificationApprovedNotification(userId: UserRef, requestId: string): void {
  notify(userId, "Verification approved", `Your verification request ${requestId} has been approved. You are now a verified seller.`);
}
export function sendVerificationRejectedNotification(userId: UserRef, requestId: string, reason: string): void {
  notify(userId, "Verification request rejected", `Your verification request ${requestId} was rejected. Reason: ${reason}`);
}
