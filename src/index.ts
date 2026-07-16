#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LunaNodeClient } from "./client.js";
import { selectEnabledTools } from "./gating.js";
import { buildServer } from "./server.js";
import { allTools } from "./tools/index.js";

async function main(): Promise<void> {
  const apiId = process.env.LUNANODE_API_ID;
  const apiKey = process.env.LUNANODE_API_KEY;
  if (!apiId || !apiKey) {
    console.error("lunanode-mcp: LUNANODE_API_ID and LUNANODE_API_KEY must be set");
    process.exit(1);
  }
  if (apiKey.length !== 128) {
    console.error(`lunanode-mcp: LUNANODE_API_KEY must be 128 characters (got ${apiKey.length})`);
    process.exit(1);
  }

  const client = new LunaNodeClient({ apiId, apiKey });
  const tools = selectEnabledTools(allTools, {
    writes: process.env.LUNANODE_ENABLE_WRITES,
    deletes: process.env.LUNANODE_ENABLE_DELETES,
  });
  console.error(`lunanode-mcp: ${tools.length} tools enabled`);

  const server = buildServer(client, tools);
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error("lunanode-mcp: fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
