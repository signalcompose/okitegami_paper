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

## Phase 1: Core Infrastructure (COMPLETED)

*Establishes the ACM MCP server skeleton and experience store.*

- [x] MCP server project setup (TypeScript, `@modelcontextprotocol/sdk`)
- [x] SQLite experience store (schema per SPECIFICATION.md Section 4)
- [x] Experience entry CRUD operations
- [x] Configuration system (mode, top_k, thresholds)
- [x] Unit tests for store operations (33 tests)

**Completed**: PR #6, merge commit 5aefcad

---

## Phase 2: Signal Collection (COMPLETED)

*Implements hooks that capture implicit feedback signals.*

- [x] PostToolUseFailure hook — interrupt detection (Level 1)
- [x] UserPromptSubmit hook — post-interrupt dialogue capture + corrective instruction detection (Level 1, 3)
- [x] PostToolUse hook — successful tool completion tracking (Level 4)
- [x] Stop hook — normal completion recording
- [x] Signal aggregation per session
- [x] Unit tests (64 tests)

**Completed**: PR #12

---

## Phase 3: Experience Generation (COMPLETED)

*Converts collected signals into scored experience entries.*

- [x] SessionEnd hook — experience entry generation
- [x] Signal strength scoring (per SPECIFICATION.md Section 2.2)
- [x] Retrieval key extraction (keyword extraction from session content)
- [x] Promotion threshold filtering
- [x] Success/failure entry generation logic
- [x] Unit tests (51 tests)

**Completed**: PR #18

---

## Phase 4: Retrieval and Injection (COMPLETED)

*Implements semantic retrieval and context injection at session start.*

- [x] Embedding generation for retrieval keys (all-MiniLM-L6-v2, 384-dim)
- [x] Cosine similarity search over experience DB
- [x] SessionStart hook — retrieve and inject relevant experiences
- [x] Injection text formatting (compact, <500 tokens for top-5)
- [x] Integration tests: full write→retrieve cycle (50 tests)

**Completed**: PR #26

---

## Phase 5: Experimental Task Suite (COMPLETED)

*Creates the task definitions and evaluation harness for Paper Section 5.4.*

- [x] Task A: Multi-file bug fix (seeded bug + test suite)
- [x] Task B: Feature addition (specification + functional tests)
- [x] Task C: Refactoring (codebase + linting rules + consistency checks)
- [x] Evaluation harness: automated metric collection
- [x] Experiment runner: hook-free execution via `claude --print`

**Completed**: PR #36 (task suite), PR #44 (hook integration), PR #48 (hook-free runner)

---

## Phase 6: Experimental Execution and Analysis

*Run experiments and analyze results. 3本柱アプローチで ASE 2026 (3/26) に向けた証拠を構築する。*

### Milestone 6-A: Automated Pipeline Validation (COMPLETED)

**目的**: 自動実験パイプラインで ACM injection mechanism を検証する。

実施済み結果:

| Task | Control | ACM-SF | 備考 |
|------|---------|--------|------|
| Task A | 1.000 | 1.000 | 天井効果 |
| Task B | 1.000 | 1.000 | 天井効果 |
| Task C（初回） | 0.912 | 0.863 | ACM 逆方向 |
| Task C（改善後） | 0.938 | 0.950 | +1.25%、有意差なし |

知見:
- Task A/B は天井効果により ACM 効果を測定不可
- 経験エントリの品質改善（actionable outcome）で方向は正に転じた
- Task C は baseline が高く改善余地が限定的

**Completed**: PR #54 (experience quality improvement), PR #58 (re-experiment results)

### Milestone 6-D: Task D — Harder Task for Ceiling Effect Mitigation

**目的**: より難易度の高いタスクで天井効果を回避し、ACM injection の効果を測定する。

- [ ] Task D 実装（2D Dungeon Generator or 代替タスク）
- [ ] reset.sh / vitest 採点環境の整備
- [ ] Control × 5 + ACM-SF × 5 = 10セッション実行
- [ ] 結果分析・記録

完了条件: completion_rate にばらつきがあり（天井効果なし）、条件間差が観察可能。
null result も「タスク難易度と ACM 効果の関係」の知見として有意義。

### Milestone 6-E: PTY Signal Case Study（定性デモンストレーション）

**目的**: ACM の差別化ポイントである PTY シグナル（Ctrl+C interrupt, rewind）が
実際に機能することを定性的に示す。統制実験ではなく Case Study として記述。

- [ ] やまとさんが Claude Code + ACM MCP で実際のコーディング作業を 2-3 セッション実施
- [ ] 意図的に interrupt (Ctrl+C) を発生させ、ACM が捕捉することを確認
- [ ] experience DB にシグナル情報が記録されることを確認
- [ ] 次セッションで経験が注入されることを確認
- [ ] ログ / スクリーンショットで evidence を収集

完了条件: PTY シグナルの capture → store → retrieve → inject サイクルが
定性的に動作確認できること。論文 Section 5 の Case Study として記述可能な evidence が揃うこと。

**所要時間**: 半日程度

### Milestone 6-B: Full Experimental Set（保留）

論文 Section 5.2 の全条件（5条件 × 3コンテキストサイズ × 3タスク × 5セッション = 225回）。
ASE 2026 の締切を考慮し、現時点では保留。6-D/6-E の結果を見てやまとさんが判断する。

### Corresponds to

- Paper Section 5 (entire Experimental Design)
- Paper Section 6 (Discussion — will be updated with results)

---

---

## Phase 7: Paper Revision for ASE 2026

*Phase 6 の結果を論文に反映し、ASE 2026 (締切: 2026-03-26) に投稿する。*

### Deliverables

- [ ] Section 5 の再構成:
  - 5.1 Automated Pipeline — injection mechanism の定量評価（Task A-D）
  - 5.2 Case Study — PTY signal capture の定性デモ
  - 5.3 Results — 各タスクの結果表・分析
- [ ] Section 5 Limitations の執筆:
  - 自動実験は retrieval-injection pipeline を検証するが PTY シグナル (Level 1-3) は行使しない
  - 定量的な人間実験は Future Work
- [ ] Section 6 Discussion の更新:
  - 天井効果の分析と含意
  - 経験品質とACM効果の関係
  - タスク難易度による効果の差異
- [ ] Section 7 Future Work の更新:
  - Human-in-the-loop 実験プロトコルの設計
  - Multi-participant study
  - PTY シグナルの定量的検証
- [ ] 最終校正・フォーマット調整

### Completion Criteria

- Claims と Evidence の乖離が Limitations で明示的に扱われている
- 全実験結果が正確に反映されている
- ASE 2026 投稿フォーマットに準拠
- 3/26 締切に提出

---

## Dependencies

```
Phase 0-5 (COMPLETED) → Phase 6 → Phase 7
                          │
                          ├─ 6-D (Task D automated) ──┐
                          ├─ 6-E (Case Study manual) ──┤→ Phase 7 (Paper Revision)
                          └─ 6-B (Full set, 保留) ─────┘
```

Phase 6-D と 6-E は並行して進められる。
Phase 7 は 6-D/6-E の結果が揃い次第開始。

---

*Last updated: 2026-03-11*
