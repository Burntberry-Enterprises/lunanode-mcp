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
