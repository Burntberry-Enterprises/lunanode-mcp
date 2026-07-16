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
