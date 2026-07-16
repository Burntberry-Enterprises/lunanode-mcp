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
