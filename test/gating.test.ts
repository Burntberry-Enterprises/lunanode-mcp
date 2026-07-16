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
