import { createHmac } from "node:crypto";

export function signRequest(apiKey: string, handlerPath: string, req: string, nonce: string): string {
  return createHmac("sha512", apiKey).update(`${handlerPath}|${req}|${nonce}`).digest("hex");
}

export class LunaNodeApiError extends Error {
  constructor(message: string, public readonly handler: string) {
    super(message);
    this.name = "LunaNodeApiError";
  }
}

export interface ClientOptions {
  apiId: string;
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

export class LunaNodeClient {
  private readonly apiId: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: ClientOptions) {
    this.apiId = opts.apiId;
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = opts.baseUrl ?? "https://dynamic.lunanode.com/api/";
  }

  async request(handler: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const handlerPath = `${handler}/`;
    const req = JSON.stringify({
      ...params,
      api_id: this.apiId,
      api_partialkey: this.apiKey.slice(0, 64),
    });
    const nonce = String(Math.floor(Date.now() / 1000));
    const signature = signRequest(this.apiKey, handlerPath, req, nonce);
    const body = new URLSearchParams({ req, signature, nonce }).toString();

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${handlerPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new LunaNodeApiError(`request to ${handler} failed: ${reason}`, handler);
    }
    if (!response.ok) {
      throw new LunaNodeApiError(`request to ${handler} failed: HTTP ${response.status}`, handler);
    }
    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new LunaNodeApiError(`request to ${handler} returned invalid JSON`, handler);
    }
    if (data.success !== "yes") {
      const message = typeof data.error === "string" ? data.error : `request to ${handler} failed`;
      throw new LunaNodeApiError(message, handler);
    }
    return data;
  }
}
