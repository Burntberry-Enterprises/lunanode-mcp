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
