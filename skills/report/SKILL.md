---
name: report
description: Generate a cross-project ACM analysis report showing usage statistics and injection-to-outcome episodes.
---

# ACM Report

Generate a cross-project analysis report showing ACM usage statistics and injection-to-outcome episodes.

## Usage

```
/acm:report [project-name]
```

## Instructions

1. Call the `acm_report` MCP tool with the optional project name filter
2. Format the result as:

### Project Summary Table

| Project | Total | Success | Failure | Avg Strength | First | Last |
|---------|-------|---------|---------|--------------|-------|------|
| ... | ... | ... | ... | ... | ... | ... |

### Injection Episodes

For each episode, show:
- **Session**: `{session_id}` ({timestamp})
- **Injected**: List of injected experience entries (type, trigger, strength)
- **Session Activity**: interrupt/corrective/tool_success counts, test pass, normal stop
- **Outcome**: List of generated experience entries (type, trigger, strength)

3. If no data exists, inform the user that no ACM data has been recorded yet
4. If a project name is provided, filter episodes to that project only
