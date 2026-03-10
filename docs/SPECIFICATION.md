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

### 1.1 Functional Overview

ACM (Associative Context Memory) is an MCP server that integrates with Claude Code via the hooks API. It performs three functions:

1. **Retrieval**: At session start, query the experience DB and inject relevant entries into context
2. **Signal monitoring**: During session, capture implicit feedback signals via hooks
3. **Experience writing**: At session end, score and persist experience entries

### 1.2 Architecture

```
Claude Code
  ├── SessionStart hook    → ACM: retrieve & inject relevant experiences
  ├── UserPromptSubmit hook → ACM: capture post-interrupt dialogue, detect corrective instructions
  ├── PostToolUse hook      → ACM: record successful tool completions
  ├── PostToolUseFailure hook → ACM: detect interrupts (is_interrupt=true)
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
- **Embedding**: Local embedding model (e.g., `all-MiniLM-L6-v2` via `@xenova/transformers`)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Test framework**: Vitest

---

## 2. Experience Entry Structure

*Reference: Paper Section 3.2*

### 2.1 Schema

```typescript
interface ExperienceEntry {
  id: string;                    // UUID
  type: "success" | "failure";
  trigger: string;               // Task description / context
  action: string;                // What the agent did
  outcome: string;               // Result description
  retrieval_keys: string[];      // Keywords for semantic retrieval
  signal_strength: number;       // 0.0–1.0
  signal_type: SignalType;       // Level 1–4
  session_id: string;
  timestamp: string;             // ISO 8601

  // Failure-specific fields
  interrupt_context?: {
    turns_captured: number;      // N=3–5 post-interrupt turns
    dialogue_summary: string;    // Why the user interrupted
  };
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

| Signal | Strength Range | Direction |
|--------|---------------|-----------|
| Interrupt + post-interrupt dialogue | 0.90–1.00 | Negative |
| Rewind (detected indirectly) | 0.75–0.90 | Negative |
| Corrective instruction (3+) | 0.60–0.80 | Negative |
| Corrective instruction (1) | 0.30–0.50 | Negative |
| Test pass + uninterrupted | 0.70–0.85 | Positive |
| Uninterrupted (no tests) | 0.40–0.60 | Positive |

---

## 3. Hook Implementations

*Reference: Paper Section 3.1*

### 3.1 SessionStart Hook

**Purpose**: Retrieve relevant past experiences and inject into session context.

**Input**: `{ session_id, cwd, transcript_path }`

**Behavior**:
1. Extract task context from initial user message (via transcript_path)
2. Generate embedding from task context
3. Query experience DB: top-K (K=5) entries by cosine similarity
4. Format injection text (compact format, see Section 3.3 of paper)
5. Return injection as hook output (system prompt addition)

**Injection format**:
```
[ACM Context]
Past relevant experience:
- SUCCESS: {trigger} → {action} (strength: {score})
- FAILURE: {trigger} → {action}, user feedback: "{dialogue_summary}" (strength: {score})
Details: ~/.acm/experiences/{id}.json
```

### 3.2 PostToolUseFailure Hook

**Purpose**: Detect user interrupts (Level 1 signal).

**Input**: `{ tool_name, error, is_interrupt, session_id, ... }`

**Behavior**:
1. If `is_interrupt === true`: set session state to `interrupted`
2. Begin capturing subsequent N=3–5 turns (via UserPromptSubmit hook)
3. Store interrupt context for experience entry generation

### 3.3 UserPromptSubmit Hook

**Purpose**: Capture post-interrupt dialogue (Level 1) and detect corrective instructions (Level 3).

**Input**: `{ user_message, session_id, ... }`

**Behavior**:
1. If session state is `interrupted` and `turns_since_interrupt < 5`:
   - Capture user message as post-interrupt dialogue
   - Increment `turns_since_interrupt`
2. Run corrective instruction detection on user message:
   - Pattern matching for: "that's wrong", "try again", "not what I meant", "undo", "revert", etc.
   - Increment corrective instruction counter if detected
3. Rewind detection (indirect, per Paper Section 6.4):
   - Monitor message count in transcript; decrease indicates rewind
   - If rewind detected, treat as Level 2 signal

### 3.4 PostToolUse Hook

**Purpose**: Record successful tool completions (contributes to Level 4 positive signal).

**Input**: `{ tool_name, result, session_id, ... }`

**Behavior**:
1. Record tool completion in session state
2. If tool is a test runner and exit code = 0: set `tests_passed = true`

### 3.5 Stop Hook

**Purpose**: Record normal turn completion.

**Input**: `{ session_id, transcript_path, ... }`

**Behavior**:
1. Record turn completion in session state
2. Note: Stop hook does NOT fire on user interrupt — this non-firing is a complementary interrupt signal

### 3.6 SessionEnd Hook

**Purpose**: Finalize experience entries and persist to DB.

**Behavior**:
1. Aggregate all signals collected during session
2. Determine session outcome:
   - If `interrupted`: generate failure entry from interrupt context
   - If `corrective_instructions >= 3`: generate failure entry
   - If `tests_passed && !interrupted && corrective_instructions < 3`: generate success entry
   - Mixed signals: generate both entries for different sub-tasks
3. Generate retrieval keys from session content (keyword extraction)
4. Compute signal strength score per scoring table
5. Persist entries to experience DB
6. Log to session log

---

## 4. Experience Store

### 4.1 SQLite Schema

```sql
CREATE TABLE experiences (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('success', 'failure')),
  trigger_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  outcome_text TEXT NOT NULL,
  retrieval_keys TEXT NOT NULL,  -- JSON array
  signal_strength REAL NOT NULL,
  signal_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  interrupt_context TEXT,        -- JSON, nullable
  embedding BLOB                 -- vector embedding of retrieval_keys
);

CREATE INDEX idx_experiences_type ON experiences(type);
CREATE INDEX idx_experiences_signal_strength ON experiences(signal_strength);
CREATE INDEX idx_experiences_timestamp ON experiences(timestamp);
```

### 4.2 Storage Location

`~/.acm/experiences.db` (SQLite database)
`~/.acm/experiences/` (detailed JSON files per entry, referenced from injection)

### 4.3 Retrieval

1. Compute embedding of query (task description keywords)
2. Cosine similarity search over `embedding` column
3. Return top-K results, ordered by `similarity * signal_strength`
4. Both success and failure entries are returned

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
  "db_path": "~/.acm/experiences.db"
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
| Corrective instruction count | UserPromptSubmit pattern detection | RQ1, RQ3 |
| Context efficiency | Tokens used / task complexity | RQ4 |
| Cross-session improvement | Δ completion rate, session 1→5 | RQ1, RQ2 |
| Signal-quality correlation | Pearson r: signal strength × downstream success | RQ3 |

---

## 7. Out of Scope (Not Implemented)

The following are discussed in the paper but NOT implemented in this phase:

- **Rewind detection via dedicated hook**: Claude Code does not provide a rewind hook. Indirect detection via corrective instruction patterns only.
- **Real-time token count monitoring**: Not available via hooks API. Use post-session token counts from `~/.claude.json` for RQ4 analysis.
- **Time-decay weighting**: Mentioned in Limitations (Section 6.4) as future work.
- **Generalization to non-coding agents**: Paper scope limitation.
- **Interrupt disambiguation heuristics**: Mentioned in Limitations. All interrupts treated as negative signals for now.
- **Baseline-Serena condition**: Requires Serena MCP integration. Evaluated separately if time permits.
- **ACM-SF + Serena condition**: Combined condition. Deferred to later phase.

---

*Last updated: 2026-03-08*
