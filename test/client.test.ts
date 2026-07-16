import { describe, expect, it, vi } from "vitest";
import { LunaNodeApiError, LunaNodeClient, signRequest } from "../src/client.js";

const API_KEY = "0123456789abcdef".repeat(8); // 128 chars

const API_ID = "a".repeat(16);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeClient(fetchFn: typeof fetch): LunaNodeClient {
  return new LunaNodeClient({ apiId: API_ID, apiKey: API_KEY, fetchFn });
}

describe("signRequest", () => {
  it("produces the reference HMAC-SHA512 hex signature", () => {
    const sig = signRequest(API_KEY, "vm/list/", '{"api_id":"x"}', "1700000000");
    expect(sig).toBe("0b220bc42cb56dda3fd98d21424c4e1bc495832bf9c59e93bd9eec8d9647c09ee26800cab44f7d24efd0b0187788b971fb62a74a54df8dced9a7b23b8f29ba2a");
  });

  it("changes when the nonce changes", () => {
    const a = signRequest(API_KEY, "vm/list/", '{"api_id":"x"}', "1700000000");
    const b = signRequest(API_KEY, "vm/list/", '{"api_id":"x"}', "1700000001");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("LunaNodeClient.request", () => {
  it("posts signed form data to the handler URL and returns the payload", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: "yes", vms: [] })) as unknown as typeof fetch;
    const result = await makeClient(fetchFn).request("vm/list");
    expect(result).toEqual({ success: "yes", vms: [] });

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://dynamic.lunanode.com/api/vm/list/");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const form = new URLSearchParams(init.body as string);
    const req = JSON.parse(form.get("req")!);
    expect(req.api_id).toBe(API_ID);
    expect(req.api_partialkey).toBe(API_KEY.slice(0, 64));
    expect(form.get("nonce")).toMatch(/^\d+$/);
    expect(form.get("signature")).toBe(
      signRequest(API_KEY, "vm/list/", form.get("req")!, form.get("nonce")!),
    );
  });

  it("merges action params into req", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: "yes" })) as unknown as typeof fetch;
    await makeClient(fetchFn).request("vm/info", { vm_id: "42" });
    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const req = JSON.parse(new URLSearchParams(init.body as string).get("req")!);
    expect(req.vm_id).toBe("42");
  });

  it("throws LunaNodeApiError with the API message on success=no", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: "no", error: "no such vm" })) as unknown as typeof fetch;
    await expect(makeClient(fetchFn).request("vm/info", { vm_id: "42" }))
      .rejects.toThrow(new LunaNodeApiError("no such vm", "vm/info"));
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;
    await expect(makeClient(fetchFn).request("vm/list")).rejects.toThrow(/HTTP 500/);
  });

  it("throws on invalid JSON", async () => {
    const fetchFn = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    await expect(makeClient(fetchFn).request("vm/list")).rejects.toThrow(/invalid JSON/);
  });

  it("wraps network errors without leaking the key", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const err = await makeClient(fetchFn).request("vm/list").catch((e: Error) => e);
    expect(err).toBeInstanceOf(LunaNodeApiError);
    expect(err.message).toContain("ECONNREFUSED");
    expect(err.message).not.toContain(API_KEY);
  });
});
