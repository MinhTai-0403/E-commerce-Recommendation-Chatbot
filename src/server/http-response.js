const zlib = require("node:zlib");

const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const PRETTY_JSON = String(process.env.API_PRETTY_JSON || "false") === "true";
const GZIP_MIN_BYTES = Math.max(0, Number(process.env.API_GZIP_MIN_BYTES || 1024));

function getAllowedCorsOrigins() {
  const configured = String(process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN)
    .split(/[;,\s]+/)
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return configured.length ? [...new Set(configured)] : [DEFAULT_CORS_ORIGIN];
}

function getCorsOriginForRequest(req) {
  const allowedOrigins = getAllowedCorsOrigins();
  const requestOrigin = String(req?.headers?.origin || "").trim().replace(/\/$/, "");

  return requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];
}

function prepareCorsResponse(req, res) {
  res.corsOrigin = getCorsOriginForRequest(req);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, PRETTY_JSON ? 2 : 0);
  const shouldGzip = Buffer.byteLength(body) >= GZIP_MIN_BYTES
    && /\bgzip\b/i.test(String(res.requestAcceptEncoding || ""));
  const responseBody = shouldGzip
    ? zlib.gzipSync(body, { level: zlib.constants.Z_BEST_SPEED })
    : body;
  const durationMs = typeof res.requestStartedAtNs === "bigint"
    ? Number(process.hrtime.bigint() - res.requestStartedAtNs) / 1_000_000
    : 0;

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(responseBody),
    ...(shouldGzip ? { "Content-Encoding": "gzip" } : {}),
    "Access-Control-Allow-Origin": res.corsOrigin || getAllowedCorsOrigins()[0],
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Server-Timing, X-Response-Time-Ms",
    "Vary": "Origin, Accept-Encoding",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Api-Key, X-Bank-Webhook-Secret, X-Support-Token",
    "Server-Timing": `app;dur=${durationMs.toFixed(2)}`,
    "X-Response-Time-Ms": durationMs.toFixed(2),
  });
  res.end(responseBody);
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    message,
    error: {
      message,
      ...(details ? { details } : {}),
    },
  });
}

function parseJsonBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

module.exports = {
  getCorsOriginForRequest,
  parseJsonBody,
  prepareCorsResponse,
  sendError,
  sendJson,
};
