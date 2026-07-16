import { LunaNodeClient } from "../src/client.js";

const apiId = process.env.LUNANODE_API_ID;
const apiKey = process.env.LUNANODE_API_KEY;
if (!apiId || !apiKey) {
  console.error("smoke: set LUNANODE_API_ID and LUNANODE_API_KEY");
  process.exit(1);
}

const client = new LunaNodeClient({ apiId, apiKey });
const result = await client.request("plan/list");
const plans = result.plans;
const count = Array.isArray(plans) ? plans.length : Object.keys(plans ?? {}).length;
console.log(`smoke: plan/list OK, ${count} plans`);
