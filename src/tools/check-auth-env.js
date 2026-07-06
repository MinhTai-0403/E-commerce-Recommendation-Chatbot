require("dotenv").config();

const requiredKeys = [
  "MONGODB_URI",
  "MONGODB_DB",
  "API_PORT",
  "CORS_ORIGIN",
  "ADMIN_API_KEY",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "USERS_COLLECTION",
  "AUTH_OTP_COLLECTION",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "AUTH_TOKEN_ISSUER",
  "OTP_EXPIRES_MINUTES",
  "OTP_RESEND_COOLDOWN_SECONDS",
  "SMTP_USER",
  "SMTP_APP_PASSWORD",
  "MAIL_FROM",
];

const missing = [];

for (const key of requiredKeys) {
  const value = process.env[key];
  const status = value ? "SET" : "MISSING";
  console.log(`${key}=${status}`);
  if (!value) missing.push(key);
}

if (missing.length > 0) {
  console.error(`Missing keys: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Auth environment is ready.");
