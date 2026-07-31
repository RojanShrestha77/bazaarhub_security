// Brute-force defense tier (rubric 2.2.3 / 3): CAPTCHA gate, toggled by env
// so it can be enabled after a failure threshold without code changes.
export const CAPTCHA_SECRET: string | undefined = process.env.CAPTCHA_SECRET_KEY;
export const CAPTCHA_SITE_KEY: string | undefined = process.env.CAPTCHA_SITE_KEY;
export const CAPTCHA_ENABLED: boolean = process.env.CAPTCHA_ENABLED === "true";
export const ALERT_EMAIL: string = process.env.ALERT_EMAIL || "admin@bazaarhub.local";
