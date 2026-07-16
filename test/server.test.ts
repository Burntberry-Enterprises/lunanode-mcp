import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { buildServer, executeTool, type ApiCaller } from "../src/server.js";
import { planTools } from "../src/tools/plan.js";
import type { ToolDefinition } from "../src/types.js";

function fakeClient(result: Record<string, unknown> = { success: "yes" }): ApiCaller {
  return { request: vi.fn(async () => result) };
}

describe("executeTool", () => {
  it("calls the static handler with the input as params", async () => {
    const client = fakeClient({ success: "yes", info: { hostname: "web1" } });
    const def: ToolDefinition = {
      name: "vm_info", tier: "read", description: "", schema: {}, handler: "vm/info",
    };
    const result = await executeTool(client, def, { vm_id: "42" });
    expect(client.request).toHaveBeenCalledWith("vm/info", { vm_id: "42" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ success: "yes", info: { hostname: "web1" } });
  });

  it("resolves dynamic handlers and applies mapParams", async () => {
    const client = fakeClient();
    const def: ToolDefinition = {
      name: "vm_action", tier: "write", description: "", schema: {},
      handler: (input) => `vm/${input.action as string}`,
      mapParams: ({ action: _action, ...rest }) => rest,
    };
    await executeTool(client, def, { vm_id: "42", action: "stop" });
    expect(client.request).toHaveBeenCalledWith("vm/stop", { vm_id: "42" });
  });

  it("returns isError with the message when the client throws", async () => {
    const client: ApiCaller = { request: vi.fn(async () => { throw new Error("no such vm"); }) };
    const def: ToolDefinition = { name: "vm_info", tier: "read", description: "", schema: {}, handler: "vm/info" };
    const result = await executeTool(client, def, {});
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe("no such vm");
  });
});

describe("buildServer", () => {
  it("registers exactly the given tools and serves calls end-to-end", async () => {
    const apiClient = fakeClient({ success: "yes", plans: [] });
    const server = buildServer(apiClient, planTools);
    const mcpClient = new Client({ name: "test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const { tools } = await mcpClient.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["plan_list", "region_list"]);

    const result = await mcpClient.callTool({ name: "plan_list", arguments: {} });
    expect(apiClient.request).toHaveBeenCalledWith("plan/list", {});
    expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual({ success: "yes", plans: [] });
  });
});
