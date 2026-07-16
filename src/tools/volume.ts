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
