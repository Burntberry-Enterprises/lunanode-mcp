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
