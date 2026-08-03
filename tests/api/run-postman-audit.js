#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { MongoClient } = require("mongodb");

require("dotenv").config();
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

const ROOT = path.resolve(__dirname, "../..");
const PORT = 5050;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const DATABASE_NAME = `cosarii_api_test_p${RUN_ID}`;
const COLLECTION = path.join(ROOT, "postman", "CellphoneS-Clone-API.postman_collection.json");
const COLLECTION_RELATIVE = "postman/CellphoneS-Clone-API.postman_collection.json";
let server = null;
let client = null;
let cleanedUp = false;

function safeMessage(value) {
  return String(value || "")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED_MONGODB_URI]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 1000);
}

function isPortAvailable() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(PORT, "127.0.0.1");
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Backend Postman kết thúc sớm: ${server.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Backend Postman không sẵn sàng sau 45 giây.");
}

async function startServer() {
  if (!(await isPortAvailable())) throw new Error(`Cổng ${PORT} đang được sử dụng; không tự đổi cổng.`);
  if (!process.env.MONGODB_URI) throw new Error("Thiếu MONGODB_URI.");
  if (!/^cosarii_api_test_p\d{14}$/.test(DATABASE_NAME)) throw new Error("Tên database Postman không qua safety guard.");

  const env = {
    ...process.env,
    NODE_ENV: "test",
    API_PORT: String(PORT),
    MONGODB_DB: DATABASE_NAME,
    JWT_SECRET: `postman-jwt-${RUN_ID}`,
    SMTP_USER: "postman.audit@example.test",
    SMTP_APP_PASSWORD: "mock-only-no-network",
    GOOGLE_CLIENT_ID: "postman-audit.apps.test",
    ADMIN_USERNAME: "postman_audit_admin",
    ADMIN_PASSWORD: `Postman-${RUN_ID}-9`,
    ADMIN_EMAIL: "postman.admin@example.test",
    ADMIN_API_KEY: `postman-admin-${RUN_ID}`,
    ALLOW_DEV_ADMIN_FALLBACK: "false",
    BANK_QR_BANK_ID: "970422",
    BANK_QR_ACCOUNT_NUMBER: "0000000000",
    BANK_QR_ACCOUNT_NAME: "POSTMAN AUDIT MOCK",
    BANK_QR_WEBHOOK_SECRET: `postman-bank-${RUN_ID}`,
  };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  server = spawn(process.execPath, ["-r", path.join(ROOT, "tests", "api", "mock-external.preload.js"), path.join(ROOT, "src", "server", "api-server.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => {
    const line = safeMessage(chunk).trim();
    if (/API server listening|MongoDB source/.test(line)) process.stdout.write(`${line}\n`);
  });
  server.stderr.on("data", (chunk) => process.stderr.write(`${safeMessage(chunk).trim()}\n`));
  await waitForHealth();
}

function runNewman() {
  return new Promise((resolve, reject) => {
    const newmanArgs = [
      "--yes", "newman", "run", COLLECTION,
      "--env-var", `base_url=http://127.0.0.1:${PORT}`,
      "--reporters", "cli", "--reporter-cli-no-console",
    ];
    const child = process.platform === "win32"
      ? spawn(process.env.ComSpec || "cmd.exe", [
        "/d", "/s", "/c",
        `npx --yes newman run ${COLLECTION_RELATIVE} --env-var base_url=http://127.0.0.1:${PORT} --reporters cli --reporter-cli-no-console`,
      ], { cwd: ROOT, stdio: "inherit", windowsHide: true })
      : spawn("npx", newmanArgs, { cwd: ROOT, stdio: "inherit" });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(124);
    }, 180_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function cleanup() {
  if (cleanedUp) return;
  await stopServer();
  if (!/^cosarii_api_test_p\d{14}$/.test(DATABASE_NAME)) throw new Error("Từ chối drop database ngoài guard Postman.");
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
    await client.connect();
  }
  await client.db(DATABASE_NAME).dropDatabase();
  const databases = await client.db("admin").admin().listDatabases({ nameOnly: true });
  if (databases.databases.some((item) => item.name === DATABASE_NAME)) throw new Error(`Database ${DATABASE_NAME} chưa được xóa.`);
  process.stdout.write(`Postman cleanup: đã xóa database ${DATABASE_NAME}.\n`);
  await client.close();
  client = null;
  cleanedUp = true;
}

async function main() {
  let exitCode = 1;
  try {
    await startServer();
    process.stdout.write(`Postman backend: http://127.0.0.1:${PORT}; database tạm đã kết nối.\n`);
    exitCode = await runNewman();
  } finally {
    await cleanup();
  }
  process.exit(exitCode);
}

main().catch(async (error) => {
  process.stderr.write(`Postman audit failed: ${safeMessage(error.message)}\n`);
  try { await cleanup(); } catch (cleanupError) { process.stderr.write(`Postman cleanup failed: ${safeMessage(cleanupError.message)}\n`); }
  process.exit(1);
});
