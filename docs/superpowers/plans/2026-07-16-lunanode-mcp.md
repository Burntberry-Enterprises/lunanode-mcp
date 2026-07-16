# LunaNode MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript MCP server exposing LunaNode's core VPS API (VMs, images, volumes, floating IPs, SSH keys, plans/regions) as 43 tools with tiered write/delete gating.

**Architecture:** A single `LunaNodeClient` handles LunaNode's HMAC-SHA512 request signing. Tools are declarative `ToolDefinition` objects (name, tier, zod schema, API handler path); a generic registration loop registers only the tools enabled by `LUNANODE_ENABLE_WRITES` / `LUNANODE_ENABLE_DELETES`.

**Tech Stack:** TypeScript (strict, ESM, Node >= 18), `@modelcontextprotocol/sdk` (stdio transport), `zod`, `vitest`, `tsx`, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-07-16-lunanode-mcp-design.md` — the authority on tool inventory and gating semantics.

## Global Constraints

- Node >= 18, TypeScript `strict: true`, ESM (`"type": "module"`); relative imports use `.js` extensions.
- Tool names are snake_case exactly as listed in the spec. Tiers: 12 read, 23 write, 8 delete = 43 tools.
- Reads are always enabled. `LUNANODE_ENABLE_WRITES` / `LUNANODE_ENABLE_DELETES` each accept `true`/`1` (case-insensitive, whole tier) or a comma-separated tool-name list. Writes never imply deletes.
- The API key must never appear in logs, error messages, or tool output.
- License: MIT. Repo: github.com/Burntberry/lunanode-mcp (already created, main branch).
- Commit after every task with the message given in the task. All commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## LunaNode API Protocol Reference (verified 2026-07-16)

- URL: `POST https://dynamic.lunanode.com/api/{handler_path}` where `handler_path` = `{category}/{action}/` (trailing slash, no `api/` prefix in the signed string).
- Form-URL-encoded body, three fields: `req` (JSON), `signature`, `nonce`.
- `req` JSON = all action parameters **plus** `api_id` and `api_partialkey` (first 64 chars of the 128-char API key).
- `nonce` = current unix time in seconds, as a string.
- `signature` = hex HMAC-SHA512 over `{handler_path}|{req}|{nonce}`, keyed with the full 128-char API key.
- Response JSON: `{"success": "yes", ...}` or `{"success": "no", "error": "..."}`.

---

### Task 1: Project scaffold + request signing

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`
- Create: `src/client.ts` (signing only)
- Test: `test/client.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `signRequest(apiKey: string, handlerPath: string, req: string, nonce: string): string` (exported from `src/client.ts`)

- [ ] **Step 1: Scaffold the project**

Create `package.json`:

```json
{
  "name": "lunanode-mcp",
  "version": "0.1.0",
  "description": "MCP server for the LunaNode VPS API",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "lunanode-mcp": "dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "smoke": "tsx scripts/smoke.ts",
    "prepare": "npm run build"
  },
  "keywords": ["mcp", "model-context-protocol", "lunanode", "vps"],
  "license": "MIT",
  "engines": { "node": ">=18" }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `.gitignore`:

```
node_modules/
dist/
*.log
.env
```

Create `LICENSE` with the standard MIT license text, copyright `2026 Burntberry`.

Install dependencies (latest current versions):

```bash
npm install @modelcontextprotocol/sdk zod@^3
npm install -D typescript tsx vitest @types/node
```

- [ ] **Step 2: Write the failing signing test**

Generate the reference signature first:

```bash
node -e 'const {createHmac}=require("crypto");const key="0123456789abcdef".repeat(8);console.log(createHmac("sha512",key).update("vm/list/|{\"api_id\":\"x\"}|1700000000").digest("hex"))'
```

Create `test/client.test.ts` with the printed hex pasted in place of `PASTE_HEX_HERE`:

```typescript
import { describe, expect, it } from "vitest";
import { signRequest } from "../src/client.js";

const API_KEY = "0123456789abcdef".repeat(8); // 128 chars

describe("signRequest", () => {
  it("produces the reference HMAC-SHA512 hex signature", () => {
    const sig = signRequest(API_KEY, "vm/list/", '{"api_id":"x"}', "1700000000");
    expect(sig).toBe("PASTE_HEX_HERE");
  });

  it("changes when the nonce changes", () => {
    const a = signRequest(API_KEY, "vm/list/", '{"api_id":"x"}', "1700000000");
    const b = signRequest(API_KEY, "vm/list/", '{"api_id":"x"}', "1700000001");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{128}$/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/client.test.ts`
Expected: FAIL — cannot find module `../src/client.js`.

- [ ] **Step 4: Implement signRequest**

Create `src/client.ts`:

```typescript
import { createHmac } from "node:crypto";

export function signRequest(apiKey: string, handlerPath: string, req: string, nonce: string): string {
  return createHmac("sha512", apiKey).update(`${handlerPath}|${req}|${nonce}`).digest("hex");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore LICENSE src/client.ts test/client.test.ts
git commit -m "feat: project scaffold and LunaNode request signing"
```

---

### Task 2: LunaNode API client

**Files:**
- Modify: `src/client.ts`
- Test: `test/client.test.ts` (append)

**Interfaces:**
- Consumes: `signRequest` from Task 1
- Produces (exported from `src/client.ts`):
  - `class LunaNodeApiError extends Error { readonly handler: string }`
  - `interface ClientOptions { apiId: string; apiKey: string; fetchFn?: typeof fetch; baseUrl?: string }`
  - `class LunaNodeClient { constructor(opts: ClientOptions); request(handler: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> }` — `handler` is given WITHOUT trailing slash (e.g. `"vm/list"`); the client appends it.

- [ ] **Step 1: Write the failing client tests**

Append to `test/client.test.ts`:

```typescript
import { vi } from "vitest";
import { LunaNodeApiError, LunaNodeClient } from "../src/client.js";

const API_ID = "a".repeat(16);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeClient(fetchFn: typeof fetch): LunaNodeClient {
  return new LunaNodeClient({ apiId: API_ID, apiKey: API_KEY, fetchFn });
}

describe("LunaNodeClient.request", () => {
  it("posts signed form data to the handler URL and returns the payload", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: "yes", vms: [] })) as unknown as typeof fetch;
    const result = await makeClient(fetchFn).request("vm/list");
    expect(result).toEqual({ success: "yes", vms: [] });

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://dynamic.lunanode.com/api/vm/list/");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const form = new URLSearchParams(init.body as string);
    const req = JSON.parse(form.get("req")!);
    expect(req.api_id).toBe(API_ID);
    expect(req.api_partialkey).toBe(API_KEY.slice(0, 64));
    expect(form.get("nonce")).toMatch(/^\d+$/);
    expect(form.get("signature")).toBe(
      signRequest(API_KEY, "vm/list/", form.get("req")!, form.get("nonce")!),
    );
  });

  it("merges action params into req", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: "yes" })) as unknown as typeof fetch;
    await makeClient(fetchFn).request("vm/info", { vm_id: "42" });
    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = JSON.parse(new URLSearchParams(init.body as string).get("req")!);
    expect(req.vm_id).toBe("42");
  });

  it("throws LunaNodeApiError with the API message on success=no", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: "no", error: "no such vm" })) as unknown as typeof fetch;
    await expect(makeClient(fetchFn).request("vm/info", { vm_id: "42" }))
      .rejects.toThrow(new LunaNodeApiError("no such vm", "vm/info"));
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;
    await expect(makeClient(fetchFn).request("vm/list")).rejects.toThrow(/HTTP 500/);
  });

  it("throws on invalid JSON", async () => {
    const fetchFn = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(makeClient(fetchFn).request("vm/list")).rejects.toThrow(/invalid JSON/);
  });

  it("wraps network errors without leaking the key", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const err = await makeClient(fetchFn).request("vm/list").catch((e: Error) => e);
    expect(err).toBeInstanceOf(LunaNodeApiError);
    expect(err.message).toContain("ECONNREFUSED");
    expect(err.message).not.toContain(API_KEY);
  });
});
```

Note: `LunaNodeApiError` equality in `rejects.toThrow(new LunaNodeApiError(...))` compares message only; that is intended.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/client.test.ts`
Expected: FAIL — `LunaNodeClient` and `LunaNodeApiError` not exported.

- [ ] **Step 3: Implement the client**

Append to `src/client.ts`:

```typescript
export class LunaNodeApiError extends Error {
  constructor(message: string, public readonly handler: string) {
    super(message);
    this.name = "LunaNodeApiError";
  }
}

export interface ClientOptions {
  apiId: string;
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

export class LunaNodeClient {
  private readonly apiId: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: ClientOptions) {
    this.apiId = opts.apiId;
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = opts.baseUrl ?? "https://dynamic.lunanode.com/api/";
  }

  async request(handler: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const handlerPath = `${handler}/`;
    const req = JSON.stringify({
      ...params,
      api_id: this.apiId,
      api_partialkey: this.apiKey.slice(0, 64),
    });
    const nonce = String(Math.floor(Date.now() / 1000));
    const signature = signRequest(this.apiKey, handlerPath, req, nonce);
    const body = new URLSearchParams({ req, signature, nonce }).toString();

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${handlerPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new LunaNodeApiError(`request to ${handler} failed: ${reason}`, handler);
    }
    if (!response.ok) {
      throw new LunaNodeApiError(`request to ${handler} failed: HTTP ${response.status}`, handler);
    }
    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new LunaNodeApiError(`request to ${handler} returned invalid JSON`, handler);
    }
    if (data.success !== "yes") {
      const message = typeof data.error === "string" ? data.error : `request to ${handler} failed`;
      throw new LunaNodeApiError(message, handler);
    }
    return data;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/client.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts test/client.test.ts
git commit -m "feat: LunaNode API client with signing and error mapping"
```

---

### Task 3: Tool types and tier gating

**Files:**
- Create: `src/types.ts`, `src/gating.ts`
- Test: `test/gating.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - From `src/types.ts`:
    - `type ToolTier = "read" | "write" | "delete"`
    - `interface ToolDefinition { name: string; tier: ToolTier; description: string; schema: ZodRawShape; handler: string | ((input: Record<string, unknown>) => string); mapParams?: (input: Record<string, unknown>) => Record<string, unknown> }` — `handler` values are WITHOUT trailing slash (e.g. `"vm/list"`).
    - `const lnId: z.ZodUnion<...>` — `z.union([z.string(), z.number()])`, used for all LunaNode id parameters.
  - From `src/gating.ts`:
    - `parseTierFlag(value: string | undefined): "all" | Set<string>`
    - `selectEnabledTools(tools: ToolDefinition[], flags: { writes: string | undefined; deletes: string | undefined }, warn?: (msg: string) => void): ToolDefinition[]`

- [ ] **Step 1: Write the failing gating tests**

Create `test/gating.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { parseTierFlag, selectEnabledTools } from "../src/gating.js";
import type { ToolDefinition } from "../src/types.js";

function tool(name: string, tier: ToolDefinition["tier"]): ToolDefinition {
  return { name, tier, description: name, schema: {}, handler: "x/y" };
}

const TOOLS: ToolDefinition[] = [
  tool("vm_list", "read"),
  tool("vm_create", "write"),
  tool("vm_action", "write"),
  tool("vm_delete", "delete"),
  tool("volume_delete", "delete"),
];

const names = (tools: ToolDefinition[]) => tools.map((t) => t.name);

describe("parseTierFlag", () => {
  it("returns empty set for undefined or empty", () => {
    expect(parseTierFlag(undefined)).toEqual(new Set());
    expect(parseTierFlag("")).toEqual(new Set());
    expect(parseTierFlag("   ")).toEqual(new Set());
  });

  it("returns 'all' for true/1 in any case", () => {
    expect(parseTierFlag("true")).toBe("all");
    expect(parseTierFlag("TRUE")).toBe("all");
    expect(parseTierFlag("1")).toBe("all");
  });

  it("parses comma lists, trimming whitespace and empty entries", () => {
    expect(parseTierFlag("vm_create, vm_action,,")).toEqual(new Set(["vm_create", "vm_action"]));
  });
});

describe("selectEnabledTools", () => {
  it("enables only reads when no flags are set", () => {
    expect(names(selectEnabledTools(TOOLS, { writes: undefined, deletes: undefined }))).toEqual(["vm_list"]);
  });

  it("enables whole tiers with true", () => {
    const enabled = selectEnabledTools(TOOLS, { writes: "true", deletes: "true" });
    expect(names(enabled)).toEqual(["vm_list", "vm_create", "vm_action", "vm_delete", "volume_delete"]);
  });

  it("writes do not imply deletes and vice versa", () => {
    expect(names(selectEnabledTools(TOOLS, { writes: "true", deletes: undefined })))
      .toEqual(["vm_list", "vm_create", "vm_action"]);
    expect(names(selectEnabledTools(TOOLS, { writes: undefined, deletes: "true" })))
      .toEqual(["vm_list", "vm_delete", "volume_delete"]);
  });

  it("enables named tools only, within their own tier", () => {
    const enabled = selectEnabledTools(TOOLS, { writes: "vm_action", deletes: "vm_delete" });
    expect(names(enabled)).toEqual(["vm_list", "vm_action", "vm_delete"]);
  });

  it("warns on unknown or wrong-tier names and ignores them", () => {
    const warn = vi.fn();
    const enabled = selectEnabledTools(TOOLS, { writes: "nope,vm_delete", deletes: undefined }, warn);
    expect(names(enabled)).toEqual(["vm_list"]);
    expect(warn).toHaveBeenCalledWith('LUNANODE_ENABLE_WRITES: unknown tool "nope" ignored');
    expect(warn).toHaveBeenCalledWith('LUNANODE_ENABLE_WRITES: tool "vm_delete" is not a write-tier tool, ignored');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/gating.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement types and gating**

Create `src/types.ts`:

```typescript
import { z, type ZodRawShape } from "zod";

export type ToolTier = "read" | "write" | "delete";

export interface ToolDefinition {
  name: string;
  tier: ToolTier;
  description: string;
  schema: ZodRawShape;
  handler: string | ((input: Record<string, unknown>) => string);
  mapParams?: (input: Record<string, unknown>) => Record<string, unknown>;
}

export const lnId = z.union([z.string(), z.number()]);
```

Create `src/gating.ts`:

```typescript
import type { ToolDefinition, ToolTier } from "./types.js";

export function parseTierFlag(value: string | undefined): "all" | Set<string> {
  if (!value) return new Set();
  const trimmed = value.trim();
  if (trimmed === "") return new Set();
  if (/^(true|1)$/i.test(trimmed)) return "all";
  return new Set(trimmed.split(",").map((s) => s.trim()).filter((s) => s !== ""));
}

export function selectEnabledTools(
  tools: ToolDefinition[],
  flags: { writes: string | undefined; deletes: string | undefined },
  warn: (msg: string) => void = (msg) => console.error(msg),
): ToolDefinition[] {
  const writeFlag = parseTierFlag(flags.writes);
  const deleteFlag = parseTierFlag(flags.deletes);
  const byName = new Map(tools.map((t) => [t.name, t]));

  const checks: Array<["all" | Set<string>, ToolTier, string]> = [
    [writeFlag, "write", "LUNANODE_ENABLE_WRITES"],
    [deleteFlag, "delete", "LUNANODE_ENABLE_DELETES"],
  ];
  for (const [flag, tier, envName] of checks) {
    if (flag === "all") continue;
    for (const name of flag) {
      const tool = byName.get(name);
      if (!tool) warn(`${envName}: unknown tool "${name}" ignored`);
      else if (tool.tier !== tier) warn(`${envName}: tool "${name}" is not a ${tier}-tier tool, ignored`);
    }
  }

  return tools.filter((t) => {
    if (t.tier === "read") return true;
    const flag = t.tier === "write" ? writeFlag : deleteFlag;
    return flag === "all" || flag.has(t.name);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/gating.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/gating.ts test/gating.test.ts
git commit -m "feat: tool definition types and tier gating"
```

---

### Task 4: Server assembly + plan/region tools

**Files:**
- Create: `src/server.ts`, `src/tools/plan.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition` (Task 3), `LunaNodeClient` (Task 2)
- Produces:
  - From `src/server.ts`:
    - `type ApiCaller = Pick<LunaNodeClient, "request">`
    - `executeTool(client: ApiCaller, def: ToolDefinition, input: Record<string, unknown>): Promise<CallToolResult>`
    - `buildServer(client: ApiCaller, tools: ToolDefinition[]): McpServer`
  - From `src/tools/plan.ts`: `const planTools: ToolDefinition[]` — `plan_list`, `region_list` (both read tier)

- [ ] **Step 1: Write the failing server tests**

Create `test/server.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/server.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement server assembly and plan tools**

Create `src/tools/plan.ts`:

```typescript
import type { ToolDefinition } from "../types.js";

export const planTools: ToolDefinition[] = [
  {
    name: "plan_list",
    tier: "read",
    description: "List available LunaNode VM plans with pricing, CPU, RAM, storage, and regional availability.",
    schema: {},
    handler: "plan/list",
  },
  {
    name: "region_list",
    tier: "read",
    description: "List all LunaNode regions where services can be deployed.",
    schema: {},
    handler: "region/list",
  },
];
```

Create `src/server.ts`:

```typescript
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
```

Note: if the installed SDK version's `registerTool` callback types complain about the loose `input` type, adapt the callback signature to the SDK's expected shape (`(args, extra)`), keeping `executeTool` unchanged. The tests define the contract.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/server.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/tools/plan.ts test/server.test.ts
git commit -m "feat: MCP server assembly with plan/region tools"
```

---

### Task 5: VM tools

**Files:**
- Create: `src/tools/vm.ts`
- Test: `test/tools.test.ts`

**Interfaces:**
- Consumes: `ToolDefinition`, `lnId` (Task 3), `executeTool` (Task 4)
- Produces: `const vmTools: ToolDefinition[]` from `src/tools/vm.ts` — 17 tools: 3 read, 11 write, 3 delete

- [ ] **Step 1: Write the failing VM tool tests**

Create `test/tools.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { executeTool, type ApiCaller } from "../src/server.js";
import { vmTools } from "../src/tools/vm.js";
import type { ToolDefinition } from "../src/types.js";

function byName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

function tierCounts(tools: ToolDefinition[]): Record<string, number> {
  const counts: Record<string, number> = { read: 0, write: 0, delete: 0 };
  for (const t of tools) counts[t.tier] += 1;
  return counts;
}

// name -> [tier, static handler]
const VM_EXPECTED: Record<string, [ToolDefinition["tier"], string]> = {
  vm_list: ["read", "vm/list"],
  vm_info: ["read", "vm/info"],
  vm_iplist: ["read", "vm/iplist"],
  vm_create: ["write", "vm/create"],
  vm_reimage: ["write", "vm/reimage"],
  vm_resize: ["write", "vm/resize"],
  vm_rename: ["write", "vm/rename"],
  vm_snapshot: ["write", "vm/snapshot"],
  vm_vnc: ["write", "vm/vnc"],
  vm_floating_ip_attach: ["write", "vm/floatingip-add"],
  vm_ip_add: ["write", "vm/ip-add"],
  vm_securitygroup_add: ["write", "vm/securitygroup-add"],
  vm_securitygroup_remove: ["write", "vm/securitygroup-remove"],
  vm_delete: ["delete", "vm/delete"],
  vm_ip_delete: ["delete", "vm/ip-delete"],
  vm_floating_ip_detach: ["delete", "vm/floatingip-delete"],
};

describe("vmTools", () => {
  it("has 17 tools: 3 read, 11 write, 3 delete", () => {
    expect(vmTools).toHaveLength(17);
    expect(tierCounts(vmTools)).toEqual({ read: 3, write: 11, delete: 3 });
  });

  it("maps static tools to the right handlers and tiers", () => {
    for (const [name, [tier, handler]] of Object.entries(VM_EXPECTED)) {
      const tool = byName(vmTools, name);
      expect(tool.tier, name).toBe(tier);
      expect(tool.handler, name).toBe(handler);
    }
  });

  it("vm_action dispatches to vm/{action} and strips the action param", async () => {
    const client: ApiCaller = { request: vi.fn(async () => ({ success: "yes" })) };
    const def = byName(vmTools, "vm_action");
    expect(def.tier).toBe("write");
    for (const action of ["start", "stop", "reboot", "diskswap", "rescue", "shelve", "unshelve"]) {
      await executeTool(client, def, { vm_id: "42", action });
      expect(client.request).toHaveBeenLastCalledWith(`vm/${action}`, { vm_id: "42" });
    }
  });

  it("every tool has a nonempty description", () => {
    for (const t of vmTools) expect(t.description.length, t.name).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL — `../src/tools/vm.js` not found.

- [ ] **Step 3: Implement the VM tools**

Create `src/tools/vm.ts`:

```typescript
import { z } from "zod";
import { lnId, type ToolDefinition } from "../types.js";

const VM_ACTIONS = ["start", "stop", "reboot", "diskswap", "rescue", "shelve", "unshelve"] as const;

export const vmTools: ToolDefinition[] = [
  {
    name: "vm_list",
    tier: "read",
    description: "List all virtual machines on the LunaNode account.",
    schema: {},
    handler: "vm/list",
  },
  {
    name: "vm_info",
    tier: "read",
    description: "Get detailed configuration and live status for a virtual machine.",
    schema: { vm_id: lnId.describe("VM identifier") },
    handler: "vm/info",
  },
  {
    name: "vm_iplist",
    tier: "read",
    description: "List all IP addresses assigned to a virtual machine.",
    schema: { vm_id: lnId.describe("VM identifier") },
    handler: "vm/iplist",
  },
  {
    name: "vm_create",
    tier: "write",
    description: "Provision a new virtual machine. Requires a hostname and plan_id; boot from image_id or volume_id.",
    schema: {
      hostname: z.string().describe("Hostname for the new VM"),
      plan_id: lnId.describe("Plan identifier (see plan_list)"),
      image_id: lnId.optional().describe("Image to boot from (see image_list)"),
      volume_id: lnId.optional().describe("Existing volume to boot from instead of an image"),
      volume_virtio: z.string().optional().describe("Set to 'yes' to attach the boot volume via virtio"),
      region: z.string().optional().describe("Region name (see region_list)"),
      ip: z.string().optional().describe("Specific IP address to assign"),
      net_id: lnId.optional().describe("Virtual network to attach the VM to"),
      securitygroups: z.string().optional().describe("Comma-separated security group IDs"),
      scripts: z.string().optional().describe("Comma-separated startup script IDs"),
      key_id: lnId.optional().describe("SSH key ID to provision (see ssh_key_list)"),
      set_password: z.string().optional().describe("Set to 'yes' to generate a root password"),
      affinity_group: z.string().optional().describe("Affinity group name"),
    },
    handler: "vm/create",
  },
  {
    name: "vm_action",
    tier: "write",
    description: "Perform a VM state action: start, stop, reboot, diskswap, rescue, shelve, or unshelve.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      action: z.enum(VM_ACTIONS).describe("State action to perform"),
    },
    handler: (input) => `vm/${input.action as string}`,
    mapParams: ({ action: _action, ...rest }) => rest,
  },
  {
    name: "vm_reimage",
    tier: "write",
    description: "Reinstall a VM from an image. Destroys the VM's current disk contents.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      image_id: lnId.describe("Image to install (see image_list)"),
    },
    handler: "vm/reimage",
  },
  {
    name: "vm_resize",
    tier: "write",
    description: "Change a VM's plan (CPU/RAM/storage).",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      plan_id: lnId.describe("Target plan identifier (see plan_list)"),
    },
    handler: "vm/resize",
  },
  {
    name: "vm_rename",
    tier: "write",
    description: "Change a VM's hostname label.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      hostname: z.string().describe("New hostname"),
    },
    handler: "vm/rename",
  },
  {
    name: "vm_snapshot",
    tier: "write",
    description: "Create a disk image snapshot of a VM.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      name: z.string().describe("Name for the snapshot image"),
    },
    handler: "vm/snapshot",
  },
  {
    name: "vm_vnc",
    tier: "write",
    description: "Generate a temporary noVNC console URL for a VM. Grants console access, so it is write-gated.",
    schema: { vm_id: lnId.describe("VM identifier") },
    handler: "vm/vnc",
  },
  {
    name: "vm_floating_ip_attach",
    tier: "write",
    description: "Attach a floating (public) IP to a VM.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      ip: z.string().optional().describe("Floating IP to attach; omit to allocate a new one"),
      private_ip: z.string().optional().describe("Private IP on the VM to bind the floating IP to"),
    },
    handler: "vm/floatingip-add",
  },
  {
    name: "vm_ip_add",
    tier: "write",
    description: "Allocate an additional internal IP address on a VM.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      ip: z.string().optional().describe("Specific internal IP to add; omit to auto-assign"),
    },
    handler: "vm/ip-add",
  },
  {
    name: "vm_securitygroup_add",
    tier: "write",
    description: "Add a VM to an existing security group.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      group_id: lnId.describe("Security group identifier"),
    },
    handler: "vm/securitygroup-add",
  },
  {
    name: "vm_securitygroup_remove",
    tier: "write",
    description: "Remove a VM from a security group.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      group_id: lnId.describe("Security group identifier"),
    },
    handler: "vm/securitygroup-remove",
  },
  {
    name: "vm_delete",
    tier: "delete",
    description: "Permanently delete a virtual machine.",
    schema: { vm_id: lnId.describe("VM identifier") },
    handler: "vm/delete",
  },
  {
    name: "vm_ip_delete",
    tier: "delete",
    description: "Remove an internal IP address from a VM.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      ip: z.string().describe("Internal IP address to remove"),
    },
    handler: "vm/ip-delete",
  },
  {
    name: "vm_floating_ip_detach",
    tier: "delete",
    description: "Detach a floating IP from a VM. By default the IP is destroyed; set keep to retain it unattached.",
    schema: {
      vm_id: lnId.describe("VM identifier"),
      ip: z.string().optional().describe("Floating IP to detach"),
      keep: z.string().optional().describe("Set to 'yes' to keep the floating IP reserved instead of destroying it"),
    },
    handler: "vm/floatingip-delete",
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/vm.ts test/tools.test.ts
git commit -m "feat: VM tools (17)"
```

---

### Task 6: Image and volume tools

**Files:**
- Create: `src/tools/image.ts`, `src/tools/volume.ts`
- Test: `test/tools.test.ts` (append)

**Interfaces:**
- Consumes: `ToolDefinition`, `lnId` (Task 3)
- Produces: `const imageTools: ToolDefinition[]` (6 tools: 2 read, 3 write, 1 delete); `const volumeTools: ToolDefinition[]` (12 tools: 3 read, 7 write, 2 delete)

- [ ] **Step 1: Write the failing tests**

Append to `test/tools.test.ts` (add imports at top: `import { imageTools } from "../src/tools/image.js"; import { volumeTools } from "../src/tools/volume.js";`):

```typescript
const IMAGE_EXPECTED: Record<string, [ToolDefinition["tier"], string]> = {
  image_list: ["read", "image/list"],
  image_details: ["read", "image/details"],
  image_fetch: ["write", "image/fetch"],
  image_replicate: ["write", "image/replicate"],
  image_rename: ["write", "image/rename"],
  image_delete: ["delete", "image/delete"],
};

const VOLUME_EXPECTED: Record<string, [ToolDefinition["tier"], string]> = {
  volume_list: ["read", "volume/list"],
  volume_info: ["read", "volume/info"],
  volume_snapshot_list: ["read", "volume/snapshot-list"],
  volume_create: ["write", "volume/create"],
  volume_attach: ["write", "volume/attach"],
  volume_detach: ["write", "volume/detach"],
  volume_extend: ["write", "volume/extend"],
  volume_rename: ["write", "volume/rename"],
  volume_snapshot_create: ["write", "volume/snapshot-create"],
  volume_snapshot_replicate: ["write", "volume/snapshot-replicate"],
  volume_delete: ["delete", "volume/delete"],
  volume_snapshot_delete: ["delete", "volume/snapshot-delete"],
};

describe("imageTools", () => {
  it("has 6 tools: 2 read, 3 write, 1 delete", () => {
    expect(imageTools).toHaveLength(6);
    expect(tierCounts(imageTools)).toEqual({ read: 2, write: 3, delete: 1 });
  });

  it("maps tools to the right handlers and tiers", () => {
    for (const [name, [tier, handler]] of Object.entries(IMAGE_EXPECTED)) {
      const tool = byName(imageTools, name);
      expect(tool.tier, name).toBe(tier);
      expect(tool.handler, name).toBe(handler);
    }
  });
});

describe("volumeTools", () => {
  it("has 12 tools: 3 read, 7 write, 2 delete", () => {
    expect(volumeTools).toHaveLength(12);
    expect(tierCounts(volumeTools)).toEqual({ read: 3, write: 7, delete: 2 });
  });

  it("maps tools to the right handlers and tiers", () => {
    for (const [name, [tier, handler]] of Object.entries(VOLUME_EXPECTED)) {
      const tool = byName(volumeTools, name);
      expect(tool.tier, name).toBe(tier);
      expect(tool.handler, name).toBe(handler);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement image and volume tools**

Create `src/tools/image.ts`:

```typescript
import { z } from "zod";
import { lnId, type ToolDefinition } from "../types.js";

export const imageTools: ToolDefinition[] = [
  {
    name: "image_list",
    tier: "read",
    description: "List images available to the account, optionally filtered by region.",
    schema: { region: z.string().optional().describe("Region name to filter by") },
    handler: "image/list",
  },
  {
    name: "image_details",
    tier: "read",
    description: "Get metadata for a specific image.",
    schema: { image_id: lnId.describe("Image identifier") },
    handler: "image/details",
  },
  {
    name: "image_fetch",
    tier: "write",
    description: "Add a new image by fetching it from an HTTP, HTTPS, or FTP URL.",
    schema: {
      region: z.string().describe("Region to store the image in"),
      name: z.string().describe("Label for the new image"),
      location: z.string().describe("HTTP/HTTPS/FTP URL of the image file"),
      format: z.string().describe("Image format, e.g. qcow2, raw, or iso"),
      virtio: z.string().optional().describe("Set to 'yes' if the image expects virtio devices"),
    },
    handler: "image/fetch",
  },
  {
    name: "image_replicate",
    tier: "write",
    description: "Copy an image to another region.",
    schema: {
      image_id: lnId.describe("Image identifier"),
      region: z.string().describe("Destination region"),
    },
    handler: "image/replicate",
  },
  {
    name: "image_rename",
    tier: "write",
    description: "Change an image's label.",
    schema: {
      image_id: lnId.describe("Image identifier"),
      name: z.string().describe("New label"),
    },
    handler: "image/rename",
  },
  {
    name: "image_delete",
    tier: "delete",
    description: "Permanently delete an image.",
    schema: { image_id: lnId.describe("Image identifier") },
    handler: "image/delete",
  },
];
```

Create `src/tools/volume.ts`:

```typescript
import { z } from "zod";
import { lnId, type ToolDefinition } from "../types.js";

export const volumeTools: ToolDefinition[] = [
  {
    name: "volume_list",
    tier: "read",
    description: "List block storage volumes, optionally filtered by region.",
    schema: { region: z.string().optional().describe("Region name to filter by") },
    handler: "volume/list",
  },
  {
    name: "volume_info",
    tier: "read",
    description: "Get details for a specific volume.",
    schema: { volume_id: lnId.describe("Volume identifier") },
    handler: "volume/info",
  },
  {
    name: "volume_snapshot_list",
    tier: "read",
    description: "List volume snapshots in a region.",
    schema: { region: z.string().describe("Region name") },
    handler: "volume/snapshot-list",
  },
  {
    name: "volume_create",
    tier: "write",
    description: "Create a block storage volume, optionally pre-populated from an image or snapshot.",
    schema: {
      region: z.string().describe("Region to create the volume in"),
      label: z.string().describe("Label for the new volume"),
      size: z.number().int().positive().describe("Size in GB"),
      image: lnId.optional().describe("Image ID to initialize the volume from"),
      snapshot_id: lnId.optional().describe("Snapshot ID to initialize the volume from"),
    },
    handler: "volume/create",
  },
  {
    name: "volume_attach",
    tier: "write",
    description: "Attach a volume to a virtual machine.",
    schema: {
      volume_id: lnId.describe("Volume identifier"),
      vm_id: lnId.describe("VM identifier"),
      target: z.string().describe("Device target, e.g. vdb"),
    },
    handler: "volume/attach",
  },
  {
    name: "volume_detach",
    tier: "write",
    description: "Detach a volume from its virtual machine.",
    schema: { volume_id: lnId.describe("Volume identifier") },
    handler: "volume/detach",
  },
  {
    name: "volume_extend",
    tier: "write",
    description: "Increase the size of an unattached volume.",
    schema: {
      volume_id: lnId.describe("Volume identifier"),
      size: z.number().int().positive().describe("New size in GB (must be larger than current)"),
    },
    handler: "volume/extend",
  },
  {
    name: "volume_rename",
    tier: "write",
    description: "Change a volume's label.",
    schema: {
      volume_id: lnId.describe("Volume identifier"),
      name: z.string().describe("New label"),
    },
    handler: "volume/rename",
  },
  {
    name: "volume_snapshot_create",
    tier: "write",
    description: "Take a snapshot of a volume.",
    schema: {
      volume_id: lnId.describe("Volume identifier"),
      label: z.string().describe("Label for the snapshot"),
    },
    handler: "volume/snapshot-create",
  },
  {
    name: "volume_snapshot_replicate",
    tier: "write",
    description: "Convert a volume snapshot into an image, optionally in another region.",
    schema: {
      region: z.string().describe("Region of the source snapshot"),
      snapshot_id: lnId.describe("Snapshot identifier"),
      image_name: z.string().describe("Name for the resulting image"),
      dst_region: z.string().describe("Destination region for the image"),
    },
    handler: "volume/snapshot-replicate",
  },
  {
    name: "volume_delete",
    tier: "delete",
    description: "Permanently delete a volume.",
    schema: { volume_id: lnId.describe("Volume identifier") },
    handler: "volume/delete",
  },
  {
    name: "volume_snapshot_delete",
    tier: "delete",
    description: "Permanently delete a volume snapshot.",
    schema: {
      region: z.string().describe("Region of the snapshot"),
      snapshot_id: lnId.describe("Snapshot identifier"),
    },
    handler: "volume/snapshot-delete",
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tools.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/image.ts src/tools/volume.ts test/tools.test.ts
git commit -m "feat: image tools (6) and volume tools (12)"
```

---

### Task 7: Floating IP + SSH key tools, full registry

**Files:**
- Create: `src/tools/floating.ts`, `src/tools/sshkey.ts`, `src/tools/index.ts`
- Test: `test/tools.test.ts` (append)

**Interfaces:**
- Consumes: `ToolDefinition`, `lnId` (Task 3); tool arrays from Tasks 4-6
- Produces:
  - `const floatingTools: ToolDefinition[]` (3 tools: 1 read, 1 write, 1 delete)
  - `const sshKeyTools: ToolDefinition[]` (3 tools: 1 read, 1 write, 1 delete)
  - `const allTools: ToolDefinition[]` from `src/tools/index.ts` — concatenation: vm, image, volume, floating, sshkey, plan (43 total)

- [ ] **Step 1: Write the failing tests**

Append to `test/tools.test.ts` (add imports: `import { floatingTools } from "../src/tools/floating.js"; import { sshKeyTools } from "../src/tools/sshkey.js"; import { allTools } from "../src/tools/index.js";`):

```typescript
const FLOATING_EXPECTED: Record<string, [ToolDefinition["tier"], string]> = {
  floating_ip_list: ["read", "floating/list"],
  floating_ip_add: ["write", "floating/add"],
  floating_ip_delete: ["delete", "floating/delete"],
};

const SSHKEY_EXPECTED: Record<string, [ToolDefinition["tier"], string]> = {
  ssh_key_list: ["read", "sshkey/list"],
  ssh_key_add: ["write", "sshkey/add"],
  ssh_key_remove: ["delete", "sshkey/remove"],
};

describe("floatingTools and sshKeyTools", () => {
  it("map tools to the right handlers and tiers", () => {
    for (const [name, [tier, handler]] of Object.entries(FLOATING_EXPECTED)) {
      const tool = byName(floatingTools, name);
      expect(tool.tier, name).toBe(tier);
      expect(tool.handler, name).toBe(handler);
    }
    for (const [name, [tier, handler]] of Object.entries(SSHKEY_EXPECTED)) {
      const tool = byName(sshKeyTools, name);
      expect(tool.tier, name).toBe(tier);
      expect(tool.handler, name).toBe(handler);
    }
  });
});

describe("allTools", () => {
  it("has 43 unique tools: 12 read, 23 write, 8 delete", () => {
    expect(allTools).toHaveLength(43);
    expect(new Set(allTools.map((t) => t.name)).size).toBe(43);
    expect(tierCounts(allTools)).toEqual({ read: 12, write: 23, delete: 8 });
  });

  it("every static handler is category/action with no trailing slash", () => {
    for (const t of allTools) {
      if (typeof t.handler === "string") {
        expect(t.handler, t.name).toMatch(/^[a-z]+\/[a-z-]+$/);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the remaining tools and registry**

Create `src/tools/floating.ts`:

```typescript
import { z } from "zod";
import type { ToolDefinition } from "../types.js";

export const floatingTools: ToolDefinition[] = [
  {
    name: "floating_ip_list",
    tier: "read",
    description: "List all floating IPs on the account.",
    schema: {},
    handler: "floating/list",
  },
  {
    name: "floating_ip_add",
    tier: "write",
    description: "Provision a new unattached floating IP in a region.",
    schema: { region: z.string().describe("Region to allocate the floating IP in") },
    handler: "floating/add",
  },
  {
    name: "floating_ip_delete",
    tier: "delete",
    description: "Release an unattached floating IP from the account.",
    schema: {
      region: z.string().describe("Region of the floating IP"),
      ip: z.string().describe("Floating IP address to release"),
    },
    handler: "floating/delete",
  },
];
```

Create `src/tools/sshkey.ts`:

```typescript
import { z } from "zod";
import { lnId, type ToolDefinition } from "../types.js";

export const sshKeyTools: ToolDefinition[] = [
  {
    name: "ssh_key_list",
    tier: "read",
    description: "List stored SSH public keys with their IDs.",
    schema: {},
    handler: "sshkey/list",
  },
  {
    name: "ssh_key_add",
    tier: "write",
    description: "Store an SSH public key for provisioning VMs with key-based authentication.",
    schema: {
      label: z.string().describe("Label for the key"),
      sshkey: z.string().describe("SSH public key material (e.g. ssh-ed25519 AAAA...)"),
    },
    handler: "sshkey/add",
  },
  {
    name: "ssh_key_remove",
    tier: "delete",
    description: "Delete a stored SSH key.",
    schema: { key_id: lnId.describe("SSH key identifier") },
    handler: "sshkey/remove",
  },
];
```

Create `src/tools/index.ts`:

```typescript
import type { ToolDefinition } from "../types.js";
import { floatingTools } from "./floating.js";
import { imageTools } from "./image.js";
import { planTools } from "./plan.js";
import { sshKeyTools } from "./sshkey.js";
import { vmTools } from "./vm.js";
import { volumeTools } from "./volume.js";

export const allTools: ToolDefinition[] = [
  ...vmTools,
  ...imageTools,
  ...volumeTools,
  ...floatingTools,
  ...sshKeyTools,
  ...planTools,
];
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — all test files green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/floating.ts src/tools/sshkey.ts src/tools/index.ts test/tools.test.ts
git commit -m "feat: floating IP and SSH key tools; full 43-tool registry"
```

---

### Task 8: Entry point and build

**Files:**
- Create: `src/index.ts`
- Test: manual (process-level behavior; unit coverage already exists for all parts)

**Interfaces:**
- Consumes: `LunaNodeClient` (Task 2), `selectEnabledTools` (Task 3), `buildServer` (Task 4), `allTools` (Task 7)
- Produces: executable entry `dist/index.js` (the package `bin`)

- [ ] **Step 1: Implement the entry point**

Create `src/index.ts`:

```typescript
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
```

- [ ] **Step 2: Build and verify**

Run: `npm run build && npx vitest run`
Expected: clean tsc build, all tests pass.

- [ ] **Step 3: Manual stdio smoke check**

```bash
LUNANODE_API_ID=$(printf 'a%.0s' {1..16}) LUNANODE_API_KEY=$(printf 'b%.0s' {1..128}) \
  node -e '
const { spawn } = require("child_process");
const p = spawn("node", ["dist/index.js"], { env: process.env, stdio: ["pipe", "pipe", "inherit"] });
p.stdout.on("data", (d) => { console.log(d.toString()); p.kill(); });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n");
' 2>&1 | head -5
```

Expected: stderr shows `lunanode-mcp: 12 tools enabled`; stdout JSON lists the 12 read tools. (The initialize handshake is skipped; if the SDK rejects the bare tools/list, verifying the "12 tools enabled" stderr line plus a clean start is sufficient.)

Repeat with `LUNANODE_ENABLE_WRITES=true LUNANODE_ENABLE_DELETES=vm_delete` prepended: expect `36 tools enabled`.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: stdio entry point with env validation and gating"
```

---

### Task 9: Live smoke script

**Files:**
- Create: `scripts/smoke.ts`

**Interfaces:**
- Consumes: `LunaNodeClient` (Task 2)
- Produces: `npm run smoke` — manual live check, NOT part of CI

- [ ] **Step 1: Implement the smoke script**

Create `scripts/smoke.ts`:

```typescript
import { LunaNodeClient } from "../src/client.js";

const apiId = process.env.LUNANODE_API_ID;
const apiKey = process.env.LUNANODE_API_KEY;
if (!apiId || !apiKey) {
  console.error("smoke: set LUNANODE_API_ID and LUNANODE_API_KEY");
  process.exit(1);
}

const client = new LunaNodeClient({ apiId, apiKey });
const result = await client.request("plan/list");
const plans = result.plans;
const count = Array.isArray(plans) ? plans.length : Object.keys(plans ?? {}).length;
console.log(`smoke: plan/list OK, ${count} plans`);
```

- [ ] **Step 2: Verify it fails cleanly without credentials**

Run: `npm run smoke`
Expected: `smoke: set LUNANODE_API_ID and LUNANODE_API_KEY`, exit code 1.

(If real credentials are available in the environment, run it with them and expect `smoke: plan/list OK, N plans`. Do not commit credentials.)

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.ts
git commit -m "feat: live smoke script for plan/list"
```

---

### Task 10: CI and README

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: everything prior
- Produces: green CI on push; user-facing documentation

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Write the README**

Create `README.md` covering, in this order:

1. Title + one-line description: MCP server for the LunaNode VPS API.
2. Features: 43 tools across VMs, images, volumes, floating IPs, SSH keys, plans/regions; tiered safety gating.
3. Configuration — the env vars table: `LUNANODE_API_ID` (required), `LUNANODE_API_KEY` (required, 128 chars), `LUNANODE_ENABLE_WRITES`, `LUNANODE_ENABLE_DELETES` (each: unset = off, `true`/`1` = whole tier, comma-separated tool names = just those; reads always on; writes never imply deletes).
4. Client setup example (Claude Code / Claude Desktop JSON):

```json
{
  "mcpServers": {
    "lunanode": {
      "command": "npx",
      "args": ["-y", "github:Burntberry/lunanode-mcp"],
      "env": {
        "LUNANODE_API_ID": "your-api-id",
        "LUNANODE_API_KEY": "your-128-char-api-key",
        "LUNANODE_ENABLE_WRITES": "true",
        "LUNANODE_ENABLE_DELETES": "vm_delete,volume_delete"
      }
    }
  }
}
```

5. Tool reference: three tables (read/write/delete) listing every tool name with a one-line description, copied from the tool definitions.
6. Development: `npm install`, `npm test`, `npm run build`, `npm run smoke` (needs real credentials).
7. Note that API keys are created in the LunaNode panel under API, and a link to https://www.lunanode.com/api/overview.

- [ ] **Step 3: Verify and commit**

Run: `npm run build && npm test`
Expected: PASS.

```bash
git add .github/workflows/ci.yml README.md
git commit -m "docs: README and CI workflow"
git push
```

After pushing, check CI: `gh run watch --exit-status` (or `gh run list --limit 1`).
Expected: CI green.
