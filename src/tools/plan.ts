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
