# LunaNode MCP Server — Design

Date: 2026-07-16
Status: Approved

## Purpose

An MCP (Model Context Protocol) server exposing the LunaNode VPS provider API (https://www.lunanode.com/api/overview) as tools, so MCP clients (Claude Code, Claude Desktop, etc.) can manage LunaNode infrastructure. Scope for v1 is core VPS management: virtual machines, images, volumes, floating IPs, SSH keys, and plans/regions. DNS, email, monitoring, security group management, startup scripts, virtual networks, and billing are out of scope for v1.

## Stack

- TypeScript, Node >= 18
- `@modelcontextprotocol/sdk` (official SDK), stdio transport
- `zod` for tool input schemas
- `tsc` build to `dist/`, with a `bin` entry so the server runs via `npx` or a direct node invocation
- `vitest` for tests
- Public GitHub repo `Burntberry/lunanode-mcp`, MIT license

## API Client

A single client module (`src/client.ts`) implements LunaNode's request protocol:

- Endpoint: `POST https://dynamic.lunanode.com/api/{category}/{action}/`
- Form-encoded body with three fields:
  - `req` — JSON-encoded request parameters, always including `api_id`
  - `nonce` — current unix timestamp (seconds)
  - `signature` — hex-encoded HMAC-SHA512 of `{handler_path}|{req}|{nonce}`, keyed by the 128-character API key, where `handler_path` is `{category}/{action}/`
- Credentials come from environment variables:
  - `LUNANODE_API_ID` — 16-character API ID (required)
  - `LUNANODE_API_KEY` — 128-character API key (required)
- The server exits with a clear error at startup if either credential is missing or malformed.

### Error handling

- LunaNode responds with JSON `{"success": "yes", ...}` or `{"success": "no", "error": "..."}`. Any non-`yes` response becomes an MCP tool error carrying the API's error message.
- HTTP/network failures are wrapped in a tool error naming the action that failed.
- The API key is never logged or echoed in errors.

## Tools

43 tools in three tiers. Names are snake_case, prefixed by resource. Successful results return the relevant JSON payload from the API, pretty-printed.

### Reads (12) — always enabled

| Tool | API action | Inputs |
|---|---|---|
| `vm_list` | vm/list | — |
| `vm_info` | vm/info | vm_id |
| `vm_iplist` | vm/iplist | vm_id |
| `image_list` | image/list | region? |
| `image_details` | image/details | image_id |
| `volume_list` | volume/list | region? |
| `volume_info` | volume/info | volume_id |
| `volume_snapshot_list` | volume/snapshot-list | region |
| `floating_ip_list` | floating/list | — |
| `ssh_key_list` | sshkey/list | — |
| `plan_list` | plan/list | — |
| `region_list` | region/list | — |

### Writes (23) — gated by `LUNANODE_ENABLE_WRITES`

| Tool | API action | Inputs |
|---|---|---|
| `vm_create` | vm/create | hostname, plan_id, image_id?, volume_id?, volume_virtio?, region?, ip?, net_id?, securitygroups?, scripts?, key_id?, set_password?, affinity_group? |
| `vm_action` | vm/start, vm/stop, vm/reboot, vm/diskswap, vm/rescue, vm/shelve, vm/unshelve | vm_id, action (enum: start, stop, reboot, diskswap, rescue, shelve, unshelve) |
| `vm_reimage` | vm/reimage | vm_id, image_id |
| `vm_resize` | vm/resize | vm_id, plan_id |
| `vm_rename` | vm/rename | vm_id, hostname |
| `vm_snapshot` | vm/snapshot | vm_id, name |
| `vm_vnc` | vm/vnc | vm_id |
| `vm_floating_ip_attach` | vm/floatingip-add | vm_id, ip?, private_ip? |
| `vm_ip_add` | vm/ip-add | vm_id, ip? |
| `vm_securitygroup_add` | vm/securitygroup-add | vm_id, group_id |
| `vm_securitygroup_remove` | vm/securitygroup-remove | vm_id, group_id |
| `image_fetch` | image/fetch | region, name, location, format, virtio? |
| `image_replicate` | image/replicate | image_id, region |
| `image_rename` | image/rename | image_id, name |
| `volume_create` | volume/create | region, label, size, image?, snapshot_id? |
| `volume_attach` | volume/attach | volume_id, vm_id, target |
| `volume_detach` | volume/detach | volume_id |
| `volume_extend` | volume/extend | volume_id, size |
| `volume_rename` | volume/rename | volume_id, name |
| `volume_snapshot_create` | volume/snapshot-create | volume_id, label |
| `volume_snapshot_replicate` | volume/snapshot-replicate | region, snapshot_id, image_name, dst_region |
| `floating_ip_add` | floating/add | region |
| `ssh_key_add` | sshkey/add | label, sshkey |

Notes:
- `vm_vnc` changes no state but mints temporary console access, so it is treated as a write.
- `vm_securitygroup_add`/`vm_securitygroup_remove` only associate a VM with existing groups; creating/editing security groups is out of scope.

### Deletes (8) — gated by `LUNANODE_ENABLE_DELETES`

| Tool | API action | Inputs |
|---|---|---|
| `vm_delete` | vm/delete | vm_id |
| `vm_ip_delete` | vm/ip-delete | vm_id, ip |
| `vm_floating_ip_detach` | vm/floatingip-delete | vm_id, ip?, keep? |
| `image_delete` | image/delete | image_id |
| `volume_delete` | volume/delete | volume_id |
| `volume_snapshot_delete` | volume/snapshot-delete | region, snapshot_id |
| `floating_ip_delete` | floating/delete | region, ip |
| `ssh_key_remove` | sshkey/remove | key_id |

Note: `vm_floating_ip_detach` lives in the delete tier because the default behavior destroys the floating IP unless `keep` is set.

Excluded from v1: `image/retrieve` (raw disk image download — does not fit MCP).

## Gating

Two environment variables, each accepting either the literal `true` (case-insensitive; `1` also accepted) to enable the whole tier, or a comma-separated list of tool names to enable only those:

- `LUNANODE_ENABLE_WRITES` — write-tier tools
- `LUNANODE_ENABLE_DELETES` — delete-tier tools

Rules:
- Reads are always enabled.
- Writes never imply deletes and vice versa; each tier is controlled only by its own variable.
- Unset or empty variable → that tier's tools are disabled.
- A tool name in the list that does not exist or belongs to the other tier is ignored, with a warning to stderr at startup.
- Disabled tools are not registered with the MCP server at all — clients never see them.

## Project Layout

```
src/
  index.ts        — entry point: env validation, gating, server startup
  client.ts       — HMAC signing + request/response handling
  gating.ts       — tier/env-var parsing into an enabled-tool set
  tools/
    vm.ts         — VM tool definitions
    image.ts
    volume.ts
    floating.ts
    sshkey.ts
    plan.ts
  types.ts        — shared types (tool tier, tool definition shape)
test/
  client.test.ts  — signing vector, request encoding, error mapping
  gating.test.ts  — tier flag parsing, allowlists, unknown-name warnings
  tools.test.ts   — mocked-fetch tests per tool group
scripts/
  smoke.ts        — manual live check (plan_list) against real credentials
```

Each tool definition declares its name, tier, description, zod schema, API handler path, and a parameter-mapping function; registration code iterates definitions and registers only enabled ones. This keeps gating and registration generic — adding a future category (DNS, email) means adding one file in `tools/`.

## Testing

- Unit: HMAC signature against a fixed key/nonce/payload vector; gating parser; error mapping for `success: "no"`, HTTP errors, and malformed JSON.
- Tool-level: mocked fetch verifying each tool hits the right handler path with correctly mapped `req` parameters.
- Manual: `scripts/smoke.ts` runs `plan/list` with real credentials; not part of CI.
- CI: GitHub Actions running build + vitest on push/PR.

## Success Criteria

1. `npm run build && npm test` passes.
2. With only credentials set, an MCP client sees exactly the 12 read tools.
3. With `LUNANODE_ENABLE_WRITES=true` and `LUNANODE_ENABLE_DELETES=vm_delete`, the client sees 12 + 23 + 1 tools.
4. Live smoke test returns real plan data from LunaNode.
