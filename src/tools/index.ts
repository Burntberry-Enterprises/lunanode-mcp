import type { ToolDefinition } from "../types.js";
import { floatingTools } from "./floating.js";
import { imageTools } from "./image.js";
import { planTools } from "./plan.js";
import { sshKeyTools } from "./sshkey.js";
import { vmTools } from "./vm.js";
import { volumeTools } from "./volume.js";

export const allTools: ToolDefinition[] = [
  ...vmTools,
  ...imageTools,
  ...volumeTools,
  ...floatingTools,
  ...sshKeyTools,
  ...planTools,
];
