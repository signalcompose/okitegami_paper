---
name: health
description: Check ACM operational status including database connectivity, Ollama availability, and configuration.
user-invocable: true
---

# ACM Health Check

Check ACM operational status and report on component health.

## Usage

```
/acm:health
```

## Instructions

1. Call the `acm_health` MCP tool
2. Format the result as a status dashboard:

### ACM Health Status

| Component | Status | Details |
|-----------|--------|---------|
| Database | OK/ERROR | Path, entry count |
| Ollama | OK/UNAVAILABLE | URL, model |
| Config | OK/WARNING | Mode, verbosity |

3. If any component is unhealthy, provide actionable guidance:
   - Database errors: check `db_path` in config or `ACM_CONFIG_PATH` env var
   - Ollama unavailable: corrective detection falls back to structural analysis
   - Config warnings: show current values vs defaults
