import { createHmac } from "node:crypto";

export function signRequest(apiKey: string, handlerPath: string, req: string, nonce: string): string {
  return createHmac("sha512", apiKey).update(`${handlerPath}|${req}|${nonce}`).digest("hex");
}
