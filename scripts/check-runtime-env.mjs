#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredPublicBuildVars = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
];
const envText = readFileSync(path.join(root, ".env"), "utf8");
const configured = new Set(
  [...envText.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
);
const missing = requiredPublicBuildVars.filter((name) => !configured.has(name));

if (missing.length) {
  console.error(`[guard:runtime-env] BLOCKED: missing required build variables: ${missing.join(", ")}`);
  console.error("Reconnect the Lovable Cloud backend so the generated public build variables are restored.");
  process.exit(1);
}

console.log(`[guard:runtime-env] ok: ${requiredPublicBuildVars.length} required public build variables are configured`);
console.log("[guard:runtime-env] platform runtime variables are supplied to edge functions at deploy time");
console.log("[guard:runtime-env] user-managed integrations remain runtime concerns and do not block the frontend build");