# ACM Implementation Roadmap

*Maps implementation phases to Paper Section 5 (Experimental Design)*

---

## Phase 0: Feasibility Probe (COMPLETED)

*Paper Section 5.0*

- [x] Verify PostToolUseFailure.is_interrupt availability
- [x] Verify session log (JSONL) structure and transcript_path
- [x] Verify post-session token usage in ~/.claude.json
- [x] Confirm rewind detection limitations

**Completion criteria**: All 4 findings documented in paper and ADR 0002.

---

## Phase 1: Core Infrastructure

*Establishes the ACM MCP server skeleton and experience store.*

### Deliverables

- [ ] MCP server project setup (TypeScript, `@modelcontextprotocol/sdk`)
- [ ] SQLite experience store (schema per SPECIFICATION.md Section 4)
- [ ] Experience entry CRUD operations
- [ ] Configuration system (mode, top_k, thresholds)
- [ ] Unit tests for store operations

### Completion Criteria

- MCP server starts and responds to health check
- Experience entries can be created, read, queried
- All unit tests pass
- Configuration toggles work (disabled/success_only/failure_only/full)

### Corresponds to

- SPECIFICATION.md Section 4 (Experience Store)
- SPECIFICATION.md Section 5.1 (Configuration)

---

## Phase 2: Signal Collection

*Implements hooks that capture implicit feedback signals.*

### Deliverables

- [ ] PostToolUseFailure hook — interrupt detection (Level 1)
- [ ] UserPromptSubmit hook — post-interrupt dialogue capture + corrective instruction detection (Level 1, 3)
- [ ] PostToolUse hook — successful tool completion tracking (Level 4)
- [ ] Stop hook — normal completion recording
- [ ] Signal aggregation per session
- [ ] Unit tests for each signal type

### Completion Criteria

- Interrupt events correctly detected and recorded
- Post-interrupt N=3–5 turns captured
- Corrective instruction patterns detected
- Session signal state correctly aggregated
- All unit tests pass

### Corresponds to

- SPECIFICATION.md Section 3 (Hook Implementations)
- Paper Section 4 (Signal Taxonomy) — Levels 1, 3, 4

---

## Phase 3: Experience Generation

*Converts collected signals into scored experience entries.*

### Deliverables

- [ ] SessionEnd hook — experience entry generation
- [ ] Signal strength scoring (per SPECIFICATION.md Section 2.2)
- [ ] Retrieval key extraction (keyword extraction from session content)
- [ ] Promotion threshold filtering
- [ ] Success/failure entry generation logic
- [ ] Unit tests for scoring and generation

### Completion Criteria

- Sessions with interrupts generate failure entries with correct signal strength
- Sessions with clean completion generate success entries
- Sessions with mixed signals generate both entry types
- Entries below promotion threshold are discarded
- All unit tests pass

### Corresponds to

- SPECIFICATION.md Section 2 (Experience Entry Structure)
- Paper Section 3.4 (Experience Scoring and Promotion)

---

## Phase 4: Retrieval and Injection

*Implements semantic retrieval and context injection at session start.*

### Deliverables

- [ ] Embedding generation for retrieval keys (local model)
- [ ] Cosine similarity search over experience DB
- [ ] SessionStart hook — retrieve and inject relevant experiences
- [ ] Injection text formatting (compact, <500 tokens for top-5)
- [ ] Integration tests: full write→retrieve cycle

### Completion Criteria

- Relevant entries retrieved by semantic similarity
- Injection text correctly formatted and under token budget
- Full cycle works: signal capture → entry generation → retrieval → injection
- Integration tests pass

### Corresponds to

- SPECIFICATION.md Section 3.1 (SessionStart Hook)
- SPECIFICATION.md Section 4.3 (Retrieval)
- Paper Section 3.3 (Retrieval and Injection)

---

## Phase 5: Experimental Task Suite

*Creates the task definitions and evaluation harness for Paper Section 5.4.*

### Deliverables

- [ ] Task A: Multi-file bug fix — seeded bug in test codebase + test suite
- [ ] Task B: Feature addition — specification document + functional tests
- [ ] Task C: Refactoring — codebase + linting rules + consistency checks
- [ ] Evaluation harness: automated metric collection
- [ ] Experiment runner: execute conditions × context sizes × repetitions

### Completion Criteria

- Each task has a reproducible setup (codebase, seed, tests)
- Evaluation metrics (Section 5.5) are automatically collected
- Experiment runner can execute all conditions defined in Section 5.2

### Corresponds to

- SPECIFICATION.md Section 6 (Task Suite)
- Paper Section 5.4 (Task Suite)
- Paper Section 5.5 (Evaluation Metrics)

---

## Phase 6: Experimental Execution and Analysis

*Run experiments and analyze results for RQ1–RQ5.*

### Milestone 6-A: Minimum Viable Validation（最初に実行）

**目的**: 最小セットで ACM の有効性を確認する。

- 条件: Control vs ACM-SF（2条件のみ）
- タスク: Task A のみ
- コンテキストサイズ: Full (128k) のみ
- セッション数: 5回 × 2条件 = 10セッション

完了条件: RQ1 の仮説（ACM-SF が Control より高い task completion rate /
低い interrupt count）について傾向が確認できること。

### Milestone 6-B: Full Experimental Set（Milestone 6-A 結果を見て判断）

論文 Section 5.2 の全条件（225回）。Milestone 6-A の結果を見てやまとさんが実施を判断する。

### Deliverables

- [ ] Execute all experimental conditions (Paper Section 5.2)
- [ ] Execute context window constraint conditions (Paper Section 5.3)
- [ ] Collect all metrics (Paper Section 5.5)
- [ ] Statistical analysis: significance tests, effect sizes
- [ ] Results tables and figures for paper update

### Completion Criteria

- Milestone 6-A: 10 runs completed, RQ1 傾向確認
- Milestone 6-B: All 5 conditions × 3 context sizes × 3 tasks × 5 sessions = 225 runs completed
- RQ1–RQ5 answered with statistical evidence
- Results ready for paper Section 5 update

### Corresponds to

- Paper Section 5 (entire Experimental Design)
- Paper Section 6 (Discussion — will be updated with results)

---

## Dependencies

```
Phase 0 (done) → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
                                                    │
                                                    └─ Phase 5 can start in parallel with Phase 4
```

Phase 5 (task suite creation) is independent of Phases 2–4 and can be developed in parallel once Phase 1 infrastructure is in place.

---

*Last updated: 2026-03-08*
