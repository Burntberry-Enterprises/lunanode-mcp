import { describe, expect, it, vi } from "vitest";
import { executeTool, type ApiCaller } from "../src/server.js";
import { vmTools } from "../src/tools/vm.js";
import { imageTools } from "../src/tools/image.js";
import { volumeTools } from "../src/tools/volume.js";
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
