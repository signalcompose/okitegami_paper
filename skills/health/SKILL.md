---
name: health
description: Check ACM MCP server health status (version, timestamp).
user-invocable: true
---

# ACM Health Check

Check ACM MCP server health status.

## Usage

```
/acm:health
```

## Instructions

1. Call the `acm_health` MCP tool
2. Display the result:
   - **Status**: ok / error
   - **Version**: ACM server version
   - **Timestamp**: server response time
3. If status is not "ok", suggest checking the MCP server configuration in `.claude-plugin/plugin.json`
