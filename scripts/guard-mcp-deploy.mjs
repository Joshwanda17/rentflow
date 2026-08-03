#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "supabase/functions/mcp/index.ts",
  "supabase/functions/mcp-public/index.ts",
];
const violations = [];

for (const relative of files) {
  const source = readFileSync(path.join(root, relative), "utf8");
  if (/(["'])npm:@\//.test(source)) {
    violations.push(`${relative}: unresolved Vite alias was emitted as an npm package (npm:@/)`);
  }
  if (/from\s+["']@\//.test(source)) {
    violations.push(`${relative}: unresolved @/ source alias remains in generated edge code`);
  }
}

if (violations.length) {
  console.error("[guard:mcp-deploy] BLOCKED: generated MCP edge code is not deploy-safe.");
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error("Use relative imports inside src/lib/mcp, regenerate with Vite, then rerun this guard.");
  process.exit(1);
}

console.log(`[guard:mcp-deploy] ok: ${files.length} generated MCP functions have resolvable imports`);