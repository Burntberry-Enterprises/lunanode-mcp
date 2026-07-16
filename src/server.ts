import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { LunaNodeClient } from "./client.js";
import type { ToolDefinition } from "./types.js";

export type ApiCaller = Pick<LunaNodeClient, "request">;

export async function executeTool(
  client: ApiCaller,
  def: ToolDefinition,
  input: Record<string, unknown>,
): Promise<CallToolResult> {
  const handler = typeof def.handler === "function" ? def.handler(input) : def.handler;
  const params = def.mapParams ? def.mapParams(input) : input;
  try {
    const result = await client.request(handler, params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

export function buildServer(client: ApiCaller, tools: ToolDefinition[]): McpServer {
  const server = new McpServer({ name: "lunanode-mcp", version: "0.1.0" });
  for (const def of tools) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.schema },
      async (input: Record<string, unknown>) => executeTool(client, def, input ?? {}),
    );
  }
  return server;
}
