# Research: Claude Code Hook System Architecture for Experience Memory

## Research Date
2026-04-01

## Research Purpose
Investigate the Claude Code open-source repository (https://github.com/anthropics/claude-code) to understand hook system architecture, transcript format, session metadata, and feedback mechanisms relevant to building an experience memory system (ACM).

## Research Method
- GitHub API (`gh api`) for repository structure exploration
- WebFetch of official documentation at code.claude.com/docs/en/
- WebFetch of example hook scripts from the repository
- Cross-reference with existing ACM hook implementations in this project

## Source Documents
- https://code.claude.com/docs/en/hooks.md (primary hooks reference)
- https://code.claude.com/docs/en/plugins-reference.md (plugin system)
- https://code.claude.com/docs/en/monitoring-usage.md (OpenTelemetry metrics)
- https://code.claude.com/docs/en/checkpointing.md (session state)
- https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py

---

## 1. Hook System Architecture

### 1.1 Complete List of Hook Types (25 types)

| # | Hook Event | Fires When | Can Block? | Matcher Support |
|---|-----------|------------|-----------|-----------------|
| 1 | **SessionStart** | Session begins/resumes | No | `startup`, `resume`, `clear`, `compact` |
| 2 | **SessionEnd** | Session terminates | No | `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| 3 | **InstructionsLoaded** | CLAUDE.md or rules loaded | No (observability) | `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact` |
| 4 | **UserPromptSubmit** | User submits prompt | Yes | No matcher |
| 5 | **PreToolUse** | Before tool execution | Yes | Tool names: `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`, `AskUserQuestion`, `ExitPlanMode`, `mcp__.*` |
| 6 | **PermissionRequest** | Permission dialog shown | Yes | Same as PreToolUse |
| 7 | **PermissionDenied** | Auto mode denies tool | No | Same as PreToolUse |
| 8 | **PostToolUse** | After successful tool execution | No (stderr shown to Claude) | Same as PreToolUse |
| 9 | **PostToolUseFailure** | After tool failure | No (stderr shown to Claude) | Same as PreToolUse |
| 10 | **Notification** | System notification | No | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| 11 | **SubagentStart** | Subagent spawned | No | Agent type names |
| 12 | **SubagentStop** | Subagent finished | Yes | Agent type names |
| 13 | **TaskCreated** | Task creation | Yes | No matcher |
| 14 | **TaskCompleted** | Task completion | Yes | No matcher |
| 15 | **Stop** | Claude finishes responding | Yes | No matcher |
| 16 | **StopFailure** | Turn ends due to API error | No (output ignored) | `rate_limit`, `authentication_failed`, `billing_error`, `invalid_request`, `server_error`, `max_output_tokens`, `unknown` |
| 17 | **TeammateIdle** | Agent team teammate idle | Yes | No matcher |
| 18 | **ConfigChange** | Config file changed | Yes | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| 19 | **CwdChanged** | Working directory changed | No | No matcher |
| 20 | **FileChanged** | Watched file changed | No | Filename (basename) |
| 21 | **WorktreeCreate** | Worktree creation | Yes | No matcher |
| 22 | **WorktreeRemove** | Worktree removal | No | No matcher |
| 23 | **PreCompact** | Before context compaction | No | `manual`, `auto` |
| 24 | **PostCompact** | After compaction | No | `manual`, `auto` |
| 25 | **Elicitation** | MCP server requests input | Yes | MCP server names |
| 26 | **ElicitationResult** | User responds to elicitation | Yes | MCP server names |

### 1.2 Common Input Fields (All Hooks)

```json
{
  "session_id": "string",
  "transcript_path": "string (path to .jsonl file)",
  "cwd": "string",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "hook_event_name": "string"
}
```

Optional (in subagents):
```json
{
  "agent_id": "string",
  "agent_type": "string"
}
```

### 1.3 Hook-Specific Input Details

#### PostToolUse
```json
{
  "tool_name": "string",
  "tool_input": { /* tool-specific */ },
  "tool_response": { /* tool-specific result object */ },
  "tool_use_id": "string"
}
```

**Key finding**: `tool_response` contains the structured result returned by the tool. For Write tool, it contains `{filePath, success}`. The exact schema varies per tool. The docs do not provide per-tool response schemas, but the field is present and contains the actual tool output.

#### PostToolUseFailure
```json
{
  "tool_name": "string",
  "tool_input": { /* tool-specific */ },
  "tool_use_id": "string",
  "error": "string",
  "is_interrupt": boolean
}
```

**Key finding**: The `error` field contains the error message string. The `is_interrupt` field indicates whether the failure was due to user interruption (Ctrl+C).

#### UserPromptSubmit
```json
{
  "prompt": "string"
}
```

**Key finding**: Only the current prompt text is provided. No conversation history. However, `transcript_path` is available for reading full history from the JSONL file.

#### Stop
```json
{
  "stop_reason": "end_turn",
  "assistant_message": "string (Claude's final response text)"
}
```

**Key finding**: The field is `assistant_message` (not `last_assistant_message`). Note: Our existing stop.ts uses `last_assistant_message` which may be a legacy field name or incorrect.

#### SubagentStop
```json
{
  "stop_hook_active": boolean,
  "agent_id": "string",
  "agent_type": "string",
  "agent_transcript_path": "string",
  "last_assistant_message": "string"
}
```

Note: SubagentStop uses `last_assistant_message` while Stop uses `assistant_message`.

#### SessionStart
```json
{
  "source": "startup|resume|clear|compact",
  "model": "string",
  "agent_type": "string"
}
```

Special feature: `CLAUDE_ENV_FILE` environment variable is available. Writing to this file persists env vars for all subsequent Bash commands.

#### SessionEnd
```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "SessionEnd"
}
```

Matcher values: `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other`

#### StopFailure
```json
{
  "error_type": "rate_limit|authentication_failed|billing_error|invalid_request|server_error|max_output_tokens|unknown",
  "error_message": "string"
}
```

#### PreToolUse tool_input Schemas

**Bash**: `{command, description?, timeout?, run_in_background?}`
**Write**: `{file_path, content}`
**Edit**: `{file_path, old_string, new_string, replace_all?}`
**Read**: `{file_path, offset?, limit?}`
**Glob**: `{pattern, path?}`
**Grep**: `{pattern, path?, glob?, output_mode, -i?, multiline?}`
**WebFetch**: `{url, prompt}`
**WebSearch**: `{query, allowed_domains?, blocked_domains?}`
**Agent**: `{prompt, description, subagent_type, model?}`

---

## 2. Hook Return Values / Output Schemas

### 2.1 Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| 0 | Success | Parse JSON from stdout if present |
| 2 | Blocking error | Prevent action; stderr fed to Claude/user |
| Other | Non-blocking error | Show stderr in verbose mode, continue |

### 2.2 Common Output Fields (All Hooks)

```json
{
  "continue": boolean,       // default: true; false stops the session
  "stopReason": "string",    // shown when continue: false
  "suppressOutput": boolean, // default: false
  "systemMessage": "string"
}
```

### 2.3 Context Injection

**SessionStart output**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "string"
  }
}
```

**Or simpler**: Just print plain text to stdout. It gets added as context.

**PostToolUse output**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "string",
    "updatedMCPToolOutput": {}  // for MCP tools only
  }
}
```

**UserPromptSubmit output**:
```json
{
  "decision": "block",
  "reason": "string",
  "additionalContext": "string",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "string"
  }
}
```

**PostToolUseFailure output**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUseFailure",
    "additionalContext": "string"
  }
}
```

### 2.4 PreToolUse Decision Control

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "string",
    "updatedInput": { /* modified tool input */ },
    "additionalContext": "string"
  }
}
```

Decision precedence: `deny` > `defer` > `ask` > `allow`

### 2.5 Stop Decision Control

```json
{
  "decision": "block",
  "reason": "string"
}
```

Exit code 2 prevents Claude from stopping and continues the conversation.

---

## 3. Transcript Format

### 3.1 File Location and Format
- Path: `~/.claude/projects/<project-hash>/<session-uuid>.jsonl`
- Format: JSONL (JSON Lines) - one JSON object per line
- Available to hooks via `transcript_path` field in input

### 3.2 Transcript Entry Structure

Based on our existing `session-start.ts` implementation that reads transcripts:

```typescript
// Each line is a JSON object with at least:
{
  "type": "user" | "assistant" | ... ,
  "message": {
    "content": string | ContentBlock[]
  }
}

// ContentBlock format:
{
  "type": "text",
  "text": "string"
}
```

**Key finding**: The transcript contains user messages and assistant messages. The `type` field indicates the role. Message content can be a string or an array of content blocks (similar to Anthropic API format).

### 3.3 Transcript Access from Hooks
- The `transcript_path` is provided in every hook's input
- Hooks can read the JSONL file directly using filesystem operations
- Our existing `session-start.ts` already reads the first user message from the transcript

### 3.4 Size and Cleanup
- Checkpoints persist across sessions
- Automatically cleaned up after 30 days (configurable)
- No documented size limits for transcripts

---

## 4. Session Metadata

### 4.1 Available via Hooks
- `session_id`: Unique identifier per session
- `transcript_path`: Path to full conversation JSONL
- `cwd`: Working directory
- `permission_mode`: Current permission level
- `model` (SessionStart only): Model being used

### 4.2 No Direct Turn Count
There is **no built-in field** for total user turns. However:
- Turn count can be derived by reading the transcript JSONL and counting `type: "user"` entries
- The `UserPromptSubmit` hook fires on every prompt, so a counter can be maintained

### 4.3 Ctrl+C Detection
- **PostToolUseFailure**: Has `is_interrupt: boolean` field to detect interruption during tool execution
- **Stop hook**: Has `stop_reason` field (e.g., `end_turn`), which may distinguish normal stops
- **SessionEnd**: Has matcher values including `prompt_input_exit` which may indicate Ctrl+C at prompt

### 4.4 OpenTelemetry Metrics (if enabled)
When `CLAUDE_CODE_ENABLE_TELEMETRY=1` is set:

**Metrics**:
- `claude_code.session.count` - sessions started
- `claude_code.token.usage` - tokens used (input/output/cacheRead/cacheCreation)
- `claude_code.cost.usage` - cost in USD
- `claude_code.lines_of_code.count` - lines modified (added/removed)
- `claude_code.commit.count` - commits created
- `claude_code.pull_request.count` - PRs created
- `claude_code.code_edit_tool.decision` - accept/reject decisions
- `claude_code.active_time.total` - active time in seconds

**Events** (via `OTEL_LOGS_EXPORTER`):
- `claude_code.user_prompt` - each user prompt with `prompt_length`
- `claude_code.tool_result` - tool execution with `tool_name`, `success`, `duration_ms`, `error`
- `claude_code.api_request` - API call with `model`, `cost_usd`, `duration_ms`, tokens
- `claude_code.api_error` - API errors with `error`, `status_code`
- `claude_code.tool_decision` - permission decisions

**Correlation**: `prompt.id` (UUID v4) links all events from a single user prompt.

---

## 5. Feedback and Rating Mechanisms

### 5.1 No Built-in Feedback Feature
Claude Code does **not** have a thumbs up/down feature or explicit rating mechanism that hooks can access.

### 5.2 Implicit Quality Signals
Quality can be inferred from:
- **Corrective instructions**: User messages that indicate dissatisfaction (semantic analysis needed)
- **Tool failure rate**: `PostToolUseFailure` events vs `PostToolUse` events
- **Session end reason**: `SessionEnd` matcher values (`prompt_input_exit` = user quit)
- **Permission decisions**: `code_edit_tool.decision` accept/reject ratio
- **Interruptions**: `is_interrupt` field in PostToolUseFailure

### 5.3 Telemetry-Based Quality Indicators
- Active time (`active_time.total`) - engagement proxy
- Token efficiency (output tokens / input tokens ratio)
- Tool success rate from `tool_result` events

---

## 6. MCP Tool Interaction from Hooks

### 6.1 Hooks Cannot Directly Call MCP Tools
Hook scripts are standalone processes (command, HTTP, prompt, or agent type). They:
- Receive JSON input via stdin
- Return JSON output via stdout
- Cannot directly invoke MCP tools

### 6.2 Indirect MCP Interaction
- **PostToolUse with MCP tools**: Hooks can observe MCP tool results via `tool_response`
- **PreToolUse with MCP tools**: Hooks can modify MCP tool inputs via `updatedInput`
- **PostToolUse updatedMCPToolOutput**: Can modify MCP tool output before Claude sees it
- **MCP tool matching**: Use regex matchers like `mcp__memory__.*` or `mcp__.*`

### 6.3 Plugin MCP Servers
Plugins can bundle their own MCP servers (`.mcp.json`) that start automatically when the plugin is enabled. This is how ACM provides its MCP tools alongside hooks.

---

## 7. Hook Configuration

### 7.1 Configuration Locations (precedence)

| Location | Scope |
|----------|-------|
| `~/.claude/settings.json` | All projects |
| `.claude/settings.json` | Single project (shareable) |
| `.claude/settings.local.json` | Single project (local) |
| Managed policy settings | Organization-wide |
| Plugin `hooks/hooks.json` | When plugin enabled |
| Skill/Agent frontmatter | While active |

### 7.2 Hook Types

| Type | Description |
|------|-------------|
| `command` | Shell command/script |
| `http` | POST request to URL |
| `prompt` | Single-turn LLM evaluation |
| `agent` | Subagent with tool access |

### 7.3 Configuration Schema
```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex|*",
        "hooks": [
          {
            "type": "command",
            "command": "string",
            "timeout": 600,
            "statusMessage": "string",
            "once": false,
            "async": false,
            "if": "ToolName(pattern *)"
          }
        ]
      }
    ]
  }
}
```

### 7.4 Environment Variables in Hooks
- `CLAUDE_CODE_REMOTE`: `"true"` in web, unset locally
- `CLAUDE_PROJECT_DIR`: Project root
- `${CLAUDE_PLUGIN_ROOT}`: Plugin directory
- `${CLAUDE_PLUGIN_DATA}`: Plugin persistent data
- `CLAUDE_ENV_FILE`: (SessionStart, CwdChanged, FileChanged only)

---

## 8. Implications for ACM Experience Memory

### 8.1 Currently Utilized (in existing hooks)
- SessionStart: injection via stdout
- PostToolUse: tool success recording
- PostToolUseFailure: tool failure recording
- UserPromptSubmit: prompt recording
- Stop: completion recording
- SessionEnd: experience generation

### 8.2 Newly Discovered Opportunities

1. **StopFailure hook**: Can capture API errors as negative signals (rate_limit, server_error, etc.)
2. **PreCompact/PostCompact**: Can detect context window pressure (auto compaction = complex session)
3. **SubagentStart/SubagentStop**: Can track sub-agent usage patterns
4. **TaskCreated/TaskCompleted**: Can measure task completion rate
5. **PermissionDenied**: Can detect permission friction
6. **InstructionsLoaded**: Can detect which CLAUDE.md files were loaded
7. **SessionEnd matcher values**: `prompt_input_exit` vs `other` distinguishes user quit vs normal end
8. **PostToolUseFailure.is_interrupt**: Can detect Ctrl+C interruptions during tools

### 8.3 Data Gaps
- No explicit user satisfaction signal
- No turn count in hook input (must count from transcript)
- No token usage in hook input (only via OTel)
- `tool_response` schema is undocumented per-tool (needs empirical testing)
- Stop hook field naming inconsistency: docs say `assistant_message`, our code uses `last_assistant_message`

### 8.4 Recommendations
1. **Verify Stop hook field name**: Test whether `assistant_message` or `last_assistant_message` is the actual field name in current Claude Code version
2. **Add StopFailure hook**: Capture API errors as negative quality signals
3. **Read transcript for turn count**: Parse JSONL at session-end to count user turns
4. **Use SessionEnd matchers**: Distinguish `prompt_input_exit` (quit) from normal termination
5. **Consider PostToolUseFailure.is_interrupt**: Track Ctrl+C as friction signal
6. **Explore OTel integration**: If enabled, token/cost metrics could enrich experience scoring
