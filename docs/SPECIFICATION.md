# ACM Implementation Specification

*Single Source of Truth for implementation. All implementation must conform to this document.*
*Based on: acm-preprint-draft.md v0.11, Sections 3–5*

---

## 1. System Overview

### 1.0 Distribution Policy

本リポジトリ（`signalcompose/okitegami_paper`）自体を Marketplace プラグインとして配布する。

**目的**: 論文の反証可能性の担保。誰でも以下のコマンドで同一環境を再現できる。

```bash
/plugin marketplace add signalcompose/okitegami_paper
/plugin install acm
```

**制約**:
- 実装は `.claude-plugin/plugin.json` を持つ Marketplace プラグイン構造に準拠すること
- 論文に記載されていない機能を追加しないこと
- 実験条件の再現に必要な設定はすべて設定ファイルで制御できること

**プラグイン構造**:
- `.claude-plugin/plugin.json` — MCP サーバー定義
- `hooks/hooks.json` — Claude Code hook イベントマッピング（6 hooks）
- インストール時、hook は自動的に登録され、`ACM_CONFIG_PATH` 未設定でも `DEFAULT_CONFIG`（`mode: "full"`, `db_path: "~/.acm/experiences.db"`）で動作する

### 1.1 Functional Overview

ACM (Associative Context Memory) is an MCP server that integrates with Claude Code via the hooks API. It performs three functions:

1. **Retrieval**: At session start, query the experience DB and inject relevant entries into context
2. **Signal monitoring**: During session, capture implicit feedback signals via hooks
3. **Experience writing**: At session end, score and persist experience entries

### 1.2 Architecture

```
Claude Code
  ├── SessionStart hook    → ACM: retrieve & inject relevant experiences
  ├── UserPromptSubmit hook → ACM: capture post-interrupt dialogue
  ├── PostToolUse hook      → ACM: record successful tool completions
  ├── PostToolUseFailure hook → ACM: detect interrupts (is_interrupt=true), record tool failures
  ├── Stop hook             → ACM: mark normal completion (non-firing = interrupt confirmation)
  └── SessionEnd hook       → ACM: finalize entries, persist to DB
         │
         ▼
  ACM MCP Server (TypeScript or Python)
  ├── Signal Collector     — aggregates signals per session
  ├── Experience Generator — creates success/failure entries from signals
  ├── Experience Store     — persists entries (SQLite + vector embeddings)
  └── Retrieval Engine     — semantic search over retrieval_keys
```

### 1.3 Technology Stack

- **Language**: TypeScript (Node.js) — MCP SDK compatibility
- **Storage**: SQLite (structured data) + vector embeddings (retrieval)
- **Storage backend**: `sql.js` (WASM-based SQLite, Node version independent)
- **Embedding**: Local multilingual embedding model (`paraphrase-multilingual-MiniLM-L12-v2` via `@xenova/transformers`, 384 dim, 50+ languages)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Test framework**: Vitest

---

## 2. Experience Entry Structure

*Reference: Paper Section 3.2*

### 2.1 Schema

```typescript
interface ExperienceEntry {
  id: string;                    // UUID
  type: "success" | "failure" | "insight";
  trigger: string;               // Task description / context
  action: string;                // What the agent did
  outcome: string;               // Result description
  retrieval_keys: string[];      // Keywords for semantic retrieval
  signal_strength: number;       // 0.0–1.0
  signal_type: SignalType;       // Level 1–4
  session_id: string;
  timestamp: string;             // ISO 8601
  project?: string;              // Project name (derived from cwd basename)

  // Failure-specific fields
  interrupt_context?: {
    turns_captured: number;      // N=3–5 post-interrupt turns
    dialogue_summary: string;    // Why the user interrupted
  };

  // GC / recency tracking fields (Section 4.4)
  last_retrieved_at?: string;    // ISO 8601, updated on retrieval
  retrieval_count?: number;      // Incremented on each retrieval (default: 0)
  feedback_score?: number;       // +1 on helpful injection, -1 on same-category corrective (default: 0)
  pinned?: boolean;              // Protected from eviction (default: false)
  archived_at?: string;          // ISO 8601, soft-deleted by GC (null = active)
}

type SignalType =
  | "interrupt_with_dialogue"    // Level 1
  | "rewind"                     // Level 2
  | "corrective_instruction"     // Level 3
  | "uninterrupted_completion";  // Level 4
```

### 2.2 Signal Strength Scores

*Reference: Paper Section 4, Signal Strength Summary table*

These are initial working values; will be calibrated by experimental data (RQ3).

| Signal | Strength Range | Direction | Notes |
|--------|---------------|-----------|-------|
| Interrupt + 0 corrective | null | Ambiguous | No experience generated |
| Interrupt + corrective (1-2) | 0.40–0.60 | Negative | Corrective base + interrupt boost (+0.10) |
| Interrupt + corrective (3+) | 0.70–0.90 | Negative | Corrective base + interrupt boost (+0.10) |
| Corrective instruction (3+, no interrupt) | 0.60–0.80 | Negative | Primary failure signal |
| Corrective instruction (1-2, no interrupt) | 0.30–0.50 | Negative | |
| Test pass + uninterrupted | 0.70–0.85 | Positive | toolSuccessRatio = tool_success/(tool_success+tool_failure) |
| Uninterrupted (no tests) | 0.40–0.60 | Positive | toolSuccessRatio = tool_success/(tool_success+tool_failure) |

**Design rationale**: Interrupt alone is ambiguous (may be benign). Corrective instruction count (detected via transcript analysis at session-end) is the primary failure signal. Interrupt acts as a +0.10 strength modifier when corrective instructions are present.

### 2.3 Verbosity Setting

`AcmConfig.verbosity` controls systemMessage output detail level. Default: `"normal"`.

| Level | SessionStart (injection) | SessionEnd (detection/generation) |
|-------|--------------------------|-----------------------------------|
| `quiet` | Count only: `[ACM] N experiences injected` | Count only: `[ACM] N correctives detected, M experiences generated` |
| `normal` | Count + project + entry list with type/trigger/strength | Count + corrective prompt excerpts + generation/persist counts (method/confidence omitted) |
| `verbose` | normal + retrieval similarity/score per entry | normal + method/confidence per corrective |

All levels: no output when corrective_count = 0 and entries_generated = 0.

systemMessage is written to stderr and displayed as hook output in Claude Code.

### 2.4 JSONL Operational Logging

ACM operations are logged to JSONL files for diagnostics and debugging. This is layer 3 of the 3-layer logging architecture:

```
Layer 1: console.error    → Real-time diagnostics (existing)
Layer 2: SQLite acm_logs  → Structured queries / reports
Layer 3: JSONL files      → Operational logs / debugging (this section)
```

**Output path**: `${CLAUDE_PLUGIN_DATA}/logs/acm-YYYY-MM-DD.jsonl`. Falls back to `~/.acm/logs/` when `CLAUDE_PLUGIN_DATA` is unset, empty, or whitespace-only. Filenames use UTC dates.

**Line format**: `{ "timestamp": "<ISO 8601>", "category": "<string>", "event": "<string>", "data": { ... } }`

**Event categories**:

| Category | Events | Purpose |
|----------|--------|---------|
| injection | count, sources | Effectiveness measurement |
| detection | corrective count, method, confidence | Detection accuracy analysis |
| generation | experience count, types | Generation pattern analysis |
| retrieval | candidate count, selected count, scores | Retrieval quality |
| llm_eval | response time, classification result | LLM performance monitoring (reserved for #93) |
| error | timeouts, DB errors | Failure analysis |
| skip | idempotency guard triggered | Deduplication verification |

**Error resilience**: Logging failures must never abort the primary hook operation. All log writes are best-effort with errors caught and reported to stderr.

**Boundary**: JSONL logs are for operator diagnostics. Claude must access ACM data only via MCP tools (`acm_retrieve`, `acm_report`), never by reading log files directly.

---

## 3. Hook Implementations

*Reference: Paper Section 3.1*

**Common bootstrap** (`bootstrapHook()`): All hooks share a common entry point. If `ACM_CONFIG_PATH` is set, the config file is loaded; otherwise, `DEFAULT_CONFIG` is used (`mode: "full"`, `db_path: "~/.acm/experiences.db"`). If `mode === "disabled"`, the hook exits silently.

### 3.1 SessionStart Hook

**Purpose**: Retrieve relevant past experiences and inject into session context.

**Input**: `{ session_id, cwd, transcript_path }`

**Behavior**:
1. Extract task context for retrieval query:
   a. Read `transcript_path` (JSONL) and extract the first user message content
   b. Build query text as `{project_name} {first_user_message}` (truncated to 200 chars)
   c. Fallback: if transcript is empty or unreadable, use `{project_name}` only
2. Generate embedding from query text
3. Query experience DB: top-K (K=5) entries by cosine similarity
4. Format injection text (compact format, see Section 3.3 of paper)
5. Return injection as hook output (system prompt addition)
6. Record injection log as `injection` event in `session_signals` (injected entry IDs, count, query text)

**Query construction rationale**: The query must occupy the same semantic space as stored experience embeddings (which use `trigger + retrieval_keys`). Using the user's task description aligns naturally with `trigger` text, which is derived from corrective prompts or tool contexts.

**Injection format**:
```
[ACM Context]
Past relevant experience:
- SUCCESS: {trigger} → {outcome} (strength: {score})
- FAILURE: {trigger} → {outcome}, user feedback: "{dialogue_summary}" (strength: {score})
```

### 3.2 PostToolUseFailure Hook

**Purpose**: Detect user interrupts (Level 1 signal) and record non-interrupt tool failures.

**Input**: `{ tool_name, error, is_interrupt, session_id, ... }`

**Behavior**:
1. If `is_interrupt === true`: set session state to `interrupted`
   - Begin capturing subsequent N=3–5 turns (via UserPromptSubmit hook)
   - Store interrupt context for experience entry generation
2. If `is_interrupt === false`: record `tool_failure` signal with tool name and error
   - Used for `toolSuccessRatio` calculation: `tool_success / (tool_success + tool_failure)`
   - Non-interrupt failures include: Bash command errors, file not found, permission denied, etc.

### 3.3 UserPromptSubmit Hook

**Purpose**: Capture post-interrupt dialogue (Level 1).

**Input**: `{ user_message, session_id, ... }`

**Behavior**:
1. If session state is `interrupted` and `turns_since_interrupt < 5`:
   - Capture user message as post-interrupt dialogue
   - Increment `turns_since_interrupt`

**Note**: Corrective instruction detection is handled by transcript analysis at session-end (see Section 3.6 SessionEnd Hook). The UserPromptSubmit hook captures post-interrupt dialogue only.

### 3.4 PostToolUse Hook

**Purpose**: Record successful tool completions (contributes to Level 4 positive signal).

**Input**: `{ tool_name, result, session_id, ... }`

**Behavior**:
1. Record tool completion in session state
2. If tool is a test runner and exit code = 0: set `tests_passed = true`

### 3.5 Stop Hook

**Purpose**: Record normal turn completion and capture Claude's final response summary.

**Input**: `{ session_id, transcript_path, last_assistant_message, stop_hook_active, ... }`

**Behavior**:
1. If `stop_hook_active === true`: exit immediately (prevent infinite loop)
2. Record turn completion in session state, storing `last_assistant_message` (truncated to 500 chars) in signal data
3. Note: Stop hook does NOT fire on user interrupt — this non-firing is a complementary interrupt signal
4. `last_assistant_message` is used by ExperienceGenerator to improve `action`/`outcome` text quality

### 3.6 SessionEnd Hook

**Purpose**: Detect corrective instructions via transcript analysis, finalize experience entries, and persist to DB with embeddings.

**Behavior**:

**Event registration**: SessionEnd fires exactly once per session (Issue #90). Idempotency guards are retained as safety nets: Phase 1 skips if `corrective_instruction` signals already exist (e.g., PreCompact already preserved them). Phase 2 skips if experience entries already exist for the session.

**Phase 1 — Transcript-based corrective detection** (Issue #83):
1. Read `transcript_path` from hook input
2. Parse JSONL transcript using `TranscriptParser`:
   - Filter real user messages via `permissionMode` field presence
   - Detect interrupts via literal text pattern `"[Request interrupted by user]"`
   - Construct turn sequence with interrupt markers
3. **Message normalization**: Before classification, `normalizeForClassification()` removes:
   - Mode modifier suffixes (`ultrathink`/`ultrathik`) appended by Claude Code UI
   - CLI status line prefixes (e.g., `"✶ Cerebrating… (running hooks…)\n\n"`)
   - Raw text is preserved in `HumanMessage.text` and signal `prompt` field; normalization is applied only for classification and keyword extraction
4. Classify user messages using `CorrectiveClassifier`:
   - **Primary**: Local LLM (Ollama, default model: `gemma2:2b`, `temperature: 0`)
   - **Fallback**: If Ollama unavailable, use structural detection (interrupt-only)
     - Structural fallback filters: messages < 6 characters, continuation tokens (`続けて`, `continue`, `ok`, etc.), agreement patterns (`ましょう`, `ください`), and confirmation questions (`認識でいいですか？`, etc.) are excluded
     - Structural confidence is `0.4` (low-precision heuristic)
   - First message in session is excluded (cannot be corrective)
5. Record detected corrections as `corrective_instruction` signals via `signalStore.addSignal()`
   - Signal data includes: `prompt` (truncated), `reason`, `confidence`, `method` (llm|structural)

**Phase 2 — Experience generation** (existing):
6. Aggregate all signals collected during session (including newly added corrective signals)
7. Determine session outcome:
   - If `corrective_instructions > 0`: generate failure entry (corrective-driven)
     - If also interrupted: use `interrupt_with_dialogue` signal type, add interrupt_context
     - If not interrupted: use `corrective_instruction` signal type
   - If `interrupted && corrective_instructions == 0`: ambiguous — no entry generated
   - If `!interrupted && corrective_instructions == 0`: generate success entry
8. Generate retrieval keys from session content (keyword extraction)
9. Compute signal strength score per scoring table
10. Generate embedding for each entry using `buildEmbeddingText(entry)` (shared with `acm_store_embedding` tool)
11. Persist entries with embedding to experience DB via `createWithEmbedding()`
12. Log to session log

**Embedding generation rationale**: Entries without embeddings are excluded from semantic retrieval (`getAllWithEmbedding()` filters by `embedding IS NOT NULL`). Generating embeddings at session-end ensures entries are immediately retrievable in subsequent sessions. Note: `session-start` and `session-end` run as separate processes, so the model is loaded independently in each. The `@xenova/transformers` model files are cached on disk after first download, but WASM initialization occurs per process.

### 3.7 PreCompact Hook

**Purpose**: Preserve corrective signals before context compaction truncates the transcript (Issue #90).

**Input**: `{ session_id, transcript_path, cwd, hook_event_name }`

**Behavior**:
1. Skip if corrective signals already exist for this session (idempotent)
2. Parse transcript and classify corrections (same logic as SessionEnd Phase 1)
3. Store corrective signals with `source: "pre_compact"` marker
4. Log preservation results

**Rationale**: In long sessions, context compaction may truncate the transcript before SessionEnd runs. PreCompact ensures corrective signals are captured from the full transcript. SessionEnd then skips Phase 1 if PreCompact already preserved signals, and proceeds directly to Phase 2 (experience generation).

### 3.8 Hook-Free Experience Generation (Experiment Runner)

**Purpose**: In `--print` mode (experiment runner), hooks do not fire. Experience entries are generated programmatically from test results.

**Behavior**:
1. After Claude session completes, run vitest and (for task-c) eslint
2. Parse vitest JSON output to extract:
   - Total/passed/failed test counts
   - Failed test names (from `assertionResults[].fullName` where `status === "failed"`)
3. Generate experience entry:
   - `type`: `"success"` if completion_rate >= 0.8, else `"failure"`
   - `trigger`: Task description (TASK.md first 200 chars)
   - `action`: Claude's output summary (first 200 chars, stripped of CVI Voice patterns)
   - `outcome`: Actionable result description including:
     - For failures: list of failed test names (e.g., `"Failed tests: auth/token-refresh, auth/logout. 6/8 passed."`)
     - For successes: `"All tests passed (8/8)."`
   - `signal_strength`: completion_rate (minimum 0.1 for failures)
   - `signal_type`: `"uninterrupted_completion"` (no interrupt signals in --print mode)
4. Store entry in shared experiment DB (per condition × task × context_size)

**Rationale**: Including failed test names in `outcome` provides actionable information for subsequent sessions. Generic outcomes like "75% test pass rate" do not help the agent avoid repeating the same mistakes.

---

## 4. Experience Store

### 4.1 SQLite Schema

```sql
CREATE TABLE experiences (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('success', 'failure', 'insight')),
  trigger_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  outcome_text TEXT NOT NULL,
  retrieval_keys TEXT NOT NULL,  -- JSON array
  signal_strength REAL NOT NULL,
  signal_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  interrupt_context TEXT,        -- JSON, nullable
  embedding BLOB,                -- vector embedding of retrieval_keys
  project TEXT,                  -- Project name (cwd basename), nullable for backward compat
  last_retrieved_at TEXT,        -- ISO 8601, updated on retrieval
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  feedback_score INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,  -- 0=false, 1=true
  archived_at TEXT               -- ISO 8601, soft-deleted by GC (null = active)
);

CREATE INDEX idx_experiences_type ON experiences(type);
CREATE INDEX idx_experiences_signal_strength ON experiences(signal_strength);
CREATE INDEX idx_experiences_timestamp ON experiences(timestamp);
CREATE INDEX idx_experiences_project ON experiences(project);
CREATE INDEX idx_experiences_archived ON experiences(archived_at);
```

### 4.2 Storage Location

`~/.acm/experiences.db` (SQLite database)

### 4.3 Retrieval

1. Compute embedding of query (task description keywords)
2. Cosine similarity search over `embedding` column
3. Return top-K results, ordered by `retrieval_score`
4. Both success, failure, and insight entries are returned (archived excluded)
5. On retrieval, update `last_retrieved_at` and increment `retrieval_count`

**Retrieval Score**:
```
retrieval_score = cosine_similarity × recency_decay(last_retrieved_at) × log(retrieval_count + 1) × signal_strength
```

- `recency_decay(t) = exp(-λ × days_since(t))` where λ is configurable (default half-life: 30 days)
- For entries never retrieved (`last_retrieved_at = null`), use `timestamp` as fallback

### 4.4 Memory GC (Garbage Collection)

*Reference: Paper Section 4.2 — Memory Management*

**Design Principle**: Important memories are never deleted. Low-quality or stale entries are archived (soft delete). Reflection generalizes lessons before archival.

#### 4.4.1 Capacity Management

- `max_experiences_per_project` config setting (default: 500)
- Eviction is project-scoped: each project's entries are managed independently
- When count exceeds limit, lowest-scored entries are archived (`archived_at` set)
- **Protected entries** (never evicted):
  - `pinned = 1`
  - `feedback_score >= 3`
  - `type = 'insight'` (reflection-generated)

#### 4.4.2 LLM Reflection

- Triggered when experience count reaches 80% of `max_experiences_per_project`
- Clusters similar experiences by embedding similarity (simple greedy clustering)
- For each cluster with >= 3 entries, generates a generalized insight via Ollama
- Insight stored as `type: "insight"`, source entries archived
- "Memories fade, but lessons remain"

#### 4.4.3 Feedback Loop

- After injection, if session has no corrective instructions → `feedback_score += 1` for injected entries
- After injection, if session has same-category corrective → `feedback_score -= 1` for injected entries
- High `feedback_score` entries are protected from eviction

#### 4.4.4 MCP Tool: `acm_pin_experience`

Pin an experience entry to protect it from GC eviction.

**Input**: `{ id: string }`
**Output**: `{ success: boolean, entry_id: string }`

---

## 5. Experimental Conditions

*Reference: Paper Section 5.2*

The implementation must support the following experimental conditions by configuration:

| Condition | ACM Mode | Description |
|-----------|----------|-------------|
| Control | disabled | No ACM (baseline) |
| Baseline-compact | disabled | Agent + auto-compact only |
| ACM-S | success_only | Only success entries stored & retrieved |
| ACM-F | failure_only | Only failure entries stored & retrieved |
| ACM-SF | full | Both success and failure entries |

### 5.1 Configuration

```json
{
  "mode": "full",           // "disabled" | "success_only" | "failure_only" | "full"
  "top_k": 5,              // Number of entries to retrieve
  "capture_turns": 5,      // Post-interrupt turns to capture
  "promotion_threshold": 0.3, // Minimum signal strength to persist
  "db_path": "~/.acm/experiences.db",
  "max_experiences_per_project": 500,  // GC capacity limit per project
  "recency_half_life_days": 30         // Half-life for recency decay (days)
}
```

### 5.2 Context Window Constraint (RQ4)

Context window constraints are applied at the agent level (not ACM level):
- Full: 128k tokens
- Half: 64k tokens
- Smart zone: 50k tokens (~40%)

ACM itself should minimize context consumption. Injection text target: <500 tokens for top-5 entries.

---

## 6. Task Suite

*Reference: Paper Section 5.4*

### 6.1 Task A — Multi-file Bug Fix

- Seeded bug across 5–10 files in a realistic codebase
- Evaluation: automated test suite passage
- 5 repeated sessions per condition

### 6.2 Task B — Feature Addition from Specification

- Natural language specification → implementation
- Evaluation: functional tests (automated) only. Specification adherence is not evaluated in this phase (requires human review).
- 5 repeated sessions per condition

### 6.3 Task C — Refactoring with Design Principles

- Apply design principle consistently across codebase
- Evaluation: automated linting only (eslint / tsc). Human consistency review is deferred to paper revision phase.
- 5 repeated sessions per condition

### 6.4 Task D — Algorithmic Generation

- **Domain**: 2D dungeon generation algorithm
- **Type**: Implementation from specification (seeded PRNG, two dungeon types, graph connectivity, distribution constraints)
- **Complexity**: Higher than Tasks A–C. Requires seeded PRNG, room placement without overlap, graph connectivity verification, and distribution constraint satisfaction.
- **Evaluation**: vitest (23 tests), completion_rate = passed/total
- **Background**: Added in Phase 6-D to address ceiling effect observed in Tasks A/B (completion_rate = 1.0 for both conditions). Task D targets completion_rate in the 0.5–0.8 range.
- 5 repeated sessions per condition

### 6.5 Evaluation Metrics

| Metric | Measurement | Primary RQ |
|--------|-------------|-----------|
| Task completion rate | Test pass rate (automated, 0–1) | RQ1 |
| Interrupt count | PostToolUseFailure.is_interrupt events | RQ1, RQ3 |
| Corrective instruction count | Transcript analysis at session-end (CorrectiveClassifier) | RQ1, RQ3 |
| Context efficiency | Tokens used / task complexity | RQ4 |
| Cross-session improvement | Δ completion rate, session 1→5 | RQ1, RQ2 |
| Signal-quality correlation | Pearson r: signal strength × downstream success | RQ3 |

---

## 7. Out of Scope (Not Implemented)

The following are discussed in the paper but NOT implemented in this phase:

- **Rewind detection via dedicated hook**: Claude Code does not provide a rewind hook. Indirect detection via corrective instruction patterns only.
- **Real-time token count monitoring**: Not available via hooks API. Use post-session token counts from `~/.claude.json` for RQ4 analysis.
- **Time-decay weighting**: Implemented in Section 4.3/4.4 as recency_decay and GC.
- **Generalization to non-coding agents**: Paper scope limitation.
- **Interrupt disambiguation heuristics**: Mentioned in Limitations. All interrupts treated as negative signals for now.
- **Baseline-Serena condition**: Requires Serena MCP integration. Evaluated separately if time permits.
- **ACM-SF + Serena condition**: Combined condition. Deferred to later phase.

---

---

## 8. Reporting and Analysis

### 8.1 `acm_report` MCP Tool

**Purpose**: Provide cross-project analysis and injection→outcome episode tracing for case study evidence.

**Input**: `{ project?: string, limit?: number }`

**Output**:
1. **Cross-project summary**: Per-project entry counts (success/failure), average signal strength, date range
2. **Injection episodes**: Per-session records linking what was injected → what happened → what was generated

**Injection Episode Structure**:
```typescript
interface InjectionEpisode {
  session_id: string;
  project: string;
  timestamp: string;
  injected_experiences: ExperienceEntry[];  // What was injected at session start
  session_signals: SessionSignalSummary;    // What happened during session
  outcome_experiences: ExperienceEntry[];   // What was generated at session end
}
```

### 8.1.1 Measurement Report

**Purpose**: Natural experiment measurement for in-situ effectiveness evaluation.

`acm_report` output includes a `measurement` section with 4 axes:

1. **Recurrence Rate** (`recurrence_rate`): Frequency of failure pattern re-occurrence. Counts how many times the same `retrieval_keys` value appears across distinct failure experience entries. Only keys with occurrence_count > 1 are reported.

2. **Temporal Trend** (`temporal_trend`): Per-session `corrective_rate = corrective_count / tool_success_count`. Sessions with zero tool_success are excluded. Ordered chronologically to show improvement over time.

3. **Injection-Outcome Correlation** (`injection_outcome_correlation`): Per injection episode, how many corrective_instructions occurred in the same session. Low corrective_count after injection suggests the injected experience was effective.

4. **Cross-project Transfer** (`cross_project_transfer`): Detects when experiences from project A are injected into sessions associated with project B. Counts transfer occurrences per source→target project pair.

Axes 1–3 accept an optional `project` filter. Axis 4 (`cross_project_transfer`) is always computed globally, as filtering by a single project would eliminate the cross-project dimension.

### 8.2 Session Signal: `injection` Event

When the SessionStart hook injects experiences, it records an `injection` event in `session_signals` with:
- `injected_ids`: array of injected experience entry IDs
- `injected_count`: number of injected entries
- `query_text`: the query text used for retrieval
- `project`: project name at time of injection (derived from cwd basename)

This enables tracing the injection→outcome relationship via shared `session_id`.

---

*Last updated: 2026-04-14*
