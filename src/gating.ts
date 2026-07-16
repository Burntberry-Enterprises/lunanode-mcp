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
