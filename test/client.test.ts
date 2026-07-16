import { describe, expect, it } from "vitest";
import { signRequest } from "../src/client.js";

const API_KEY = "0123456789abcdef".repeat(8); // 128 chars

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
