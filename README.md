# lunanode-mcp

MCP server for the LunaNode VPS API.

## Features

- 43 tools covering VMs, images, volumes, floating IPs, SSH keys, and plans/regions.
- Tiered safety gating: read operations are always available; write and delete operations must be explicitly enabled.

## Configuration

Set these environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `LUNANODE_API_ID` | Yes | Your LunaNode API ID. |
| `LUNANODE_API_KEY` | Yes | Your LunaNode API key (128 characters). |
| `LUNANODE_ENABLE_WRITES` | No | Enables write-tier tools. Unset = off. `true`/`1` = all write tools. Comma-separated tool names = only those tools. |
| `LUNANODE_ENABLE_DELETES` | No | Enables delete-tier tools. Unset = off. `true`/`1` = all delete tools. Comma-separated tool names = only those tools. |

Read-tier tools are always enabled. Enabling writes does not imply deletes — each tier is gated independently.

## Client setup

Example configuration for Claude Code / Claude Desktop:

```json
{
  "mcpServers": {
    "lunanode": {
      "command": "npx",
      "args": ["-y", "github:Burntberry/lunanode-mcp"],
      "env": {
        "LUNANODE_API_ID": "your-api-id",
        "LUNANODE_API_KEY": "your-128-char-api-key",
        "LUNANODE_ENABLE_WRITES": "true",
        "LUNANODE_ENABLE_DELETES": "vm_delete,volume_delete"
      }
    }
  }
}
```

## Tool reference

### Read tools (always enabled)

| Tool | Description |
| --- | --- |
| `vm_list` | List all virtual machines on the LunaNode account. |
| `vm_info` | Get detailed configuration and live status for a virtual machine. |
| `vm_iplist` | List all IP addresses assigned to a virtual machine. |
| `image_list` | List images available to the account, optionally filtered by region. |
| `image_details` | Get metadata for a specific image. |
| `volume_list` | List block storage volumes, optionally filtered by region. |
| `volume_info` | Get details for a specific volume. |
| `volume_snapshot_list` | List volume snapshots in a region. |
| `floating_ip_list` | List all floating IPs on the account. |
| `ssh_key_list` | List stored SSH public keys with their IDs. |
| `plan_list` | List available LunaNode VM plans with pricing, CPU, RAM, storage, and regional availability. |
| `region_list` | List all LunaNode regions where services can be deployed. |

### Write tools (require `LUNANODE_ENABLE_WRITES`)

| Tool | Description |
| --- | --- |
| `vm_create` | Provision a new virtual machine. Requires a hostname and plan_id; boot from image_id or volume_id. |
| `vm_action` | Perform a VM state action: start, stop, reboot, diskswap, rescue, shelve, or unshelve. |
| `vm_reimage` | Reinstall a VM from an image. Destroys the VM's current disk contents. |
| `vm_resize` | Change a VM's plan (CPU/RAM/storage). |
| `vm_rename` | Change a VM's hostname label. |
| `vm_snapshot` | Create a disk image snapshot of a VM. |
| `vm_vnc` | Generate a temporary noVNC console URL for a VM. Grants console access, so it is write-gated. |
| `vm_floating_ip_attach` | Attach a floating (public) IP to a VM. |
| `vm_ip_add` | Allocate an additional internal IP address on a VM. |
| `vm_securitygroup_add` | Add a VM to an existing security group. |
| `vm_securitygroup_remove` | Remove a VM from a security group. |
| `image_fetch` | Add a new image by fetching it from an HTTP, HTTPS, or FTP URL. |
| `image_replicate` | Copy an image to another region. |
| `image_rename` | Change an image's label. |
| `volume_create` | Create a block storage volume, optionally pre-populated from an image or snapshot. |
| `volume_attach` | Attach a volume to a virtual machine. |
| `volume_detach` | Detach a volume from its virtual machine. |
| `volume_extend` | Increase the size of an unattached volume. |
| `volume_rename` | Change a volume's label. |
| `volume_snapshot_create` | Take a snapshot of a volume. |
| `volume_snapshot_replicate` | Convert a volume snapshot into an image, optionally in another region. |
| `floating_ip_add` | Provision a new unattached floating IP in a region. |
| `ssh_key_add` | Store an SSH public key for provisioning VMs with key-based authentication. |

### Delete tools (require `LUNANODE_ENABLE_DELETES`)

| Tool | Description |
| --- | --- |
| `vm_delete` | Permanently delete a virtual machine. |
| `vm_ip_delete` | Remove an internal IP address from a VM. |
| `vm_floating_ip_detach` | Detach a floating IP from a VM. By default the IP is destroyed; set keep to retain it unattached. |
| `image_delete` | Permanently delete an image. |
| `volume_delete` | Permanently delete a volume. |
| `volume_snapshot_delete` | Permanently delete a volume snapshot. |
| `floating_ip_delete` | Release an unattached floating IP from the account. |
| `ssh_key_remove` | Delete a stored SSH key. |

## Development

```bash
npm install
npm test
npm run build
npm run smoke   # needs real LunaNode credentials
```

## API keys

API keys are created in the LunaNode panel under API. See https://www.lunanode.com/api/overview for details.
