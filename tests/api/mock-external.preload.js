"use strict";

// Preloaded only by the API audit child process. It prevents every outbound
// email/Google OAuth side effect while retaining the production interfaces.
const fs = require("node:fs");
const path = require("node:path");

function appendCapture(entry) {
  const target = process.env.API_AUDIT_MAIL_CAPTURE;
  if (!target) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, "utf8");
}

function extractOtp(message = {}) {
  const combined = `${message.text || ""} ${message.html || ""}`;
  return combined.match(/\b\d{6}\b/)?.[0] || "";
}

try {
  const nodemailer = require("nodemailer");
  nodemailer.createTransport = () => ({
    verify: async () => true,
    sendMail: async (message = {}) => {
      appendCapture({
        at: new Date().toISOString(),
        channel: "smtp-mock",
        to: String(message.to || ""),
        subject: String(message.subject || "").slice(0, 200),
        otp: extractOtp(message),
      });
      return {
        accepted: [String(message.to || "")],
        rejected: [],
        messageId: `api-audit-${Date.now()}@mock.local`,
      };
    },
  });
} catch (error) {
  process.stderr.write(`[api-audit-preload] SMTP mock unavailable: ${error.message}\n`);
}

try {
  const modulePath = require.resolve("google-auth-library");
  const google = require(modulePath);
  class AuditOAuth2Client {
    async verifyIdToken({ idToken }) {
      if (idToken !== "api-audit-google-valid") {
        throw new Error("Mock Google credential rejected");
      }
      return {
        getPayload: () => ({
          sub: "api-audit-google-sub",
          email: "google.api.audit@example.test",
          email_verified: true,
          name: "Google API Audit",
          picture: "https://example.test/avatar.png",
        }),
      };
    }
  }
  require.cache[modulePath].exports = { ...google, OAuth2Client: AuditOAuth2Client };
} catch (error) {
  process.stderr.write(`[api-audit-preload] Google mock unavailable: ${error.message}\n`);
}
