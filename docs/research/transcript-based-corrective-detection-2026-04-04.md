# Research: Transcript-Based Corrective Instruction Detection

## Research Date
2026-04-04

## Research Purpose
ACM の corrective instruction 検出が完全に機能していない問題を調査し、transcript JSONL 解析による代替アプローチを設計する。

## Research Method
- 実際の transcript JSONL ファイルの直接解析（1614行、14エントリタイプ）
- ACM ソースコード（scoring.ts, generator.ts, signal-collector.ts）のトレース
- Claude Code プラグインの hooks.json 構造調査
- Stop hook ハング問題の並行調査

---

## 1. 問題の発見

### 1.1 症状
- 433 experience entries 中、failure は **0 件**（全て success, strength 0.60）
- ACM-SF（Signal + Feedback）条件が Control 条件と実質的に同一動作
- 実験の有効性が根本的に損なわれている

### 1.2 根本原因のトレース

**データフロー**:
```
corrective_instruction イベント（Claude 自己報告）
  → SessionSignalStore に記録
  → SignalCollector.getSessionSummary() で集計
  → corrective_instruction_count として scoring に渡る
  → computeFailureStrength() で failure strength を計算
  → ExperienceGenerator.generate() で failure experience 生成
```

**障害点**: Claude は `acm_record_signal` MCP ツールを一度も呼び出していない。

**結果**: `corrective_instruction_count` は常に 0。

**コード証拠** (`src/experience/scoring.ts`):
```typescript
export function computeFailureStrength(summary: SessionSummary): number | null {
  if (summary.corrective_instruction_count === 0) {
    return null;  // ← 常にここに到達
  }
  // ... failure strength 計算（到達不可能）
}
```

`null` が返ると `ExperienceGenerator.generate()` は failure experience を生成しない。

### 1.3 自己報告が機能しない理由

Claude への指示は `injector.ts` の `formatSignalInstruction()` で session-start 時に注入されるが:

1. **System prompt の優先度**: Claude Code の system prompt は非常に長く（数万トークン）、ACM の corrective instruction 報告指示は埋もれやすい
2. **MCP ツール呼び出しのコスト**: Claude がタスク遂行中に自己の行動を meta-cognitive に分析し、別のツールを呼ぶことを期待するのは現実的でない
3. **実証**: 433 セッションで呼び出し 0 回という結果が証明している

---

## 2. Transcript JSONL フォーマットの解析

### 2.1 解析対象
- ファイル: セッション transcript JSONL（`~/.claude/projects/.../<session-id>.jsonl`）
- サンプル: 1614 行、14 distinct entry types

### 2.2 エントリタイプ一覧

| Type | Count | 説明 |
|------|-------|------|
| `user` | 216 | ユーザーメッセージ（tool results 含む） |
| `assistant` | 179 | アシスタント応答 |
| `summary` | 14 | コンパクション要約 |
| `result` | 174 | ツール実行結果 |
| `compact_boundary` | 4 | コンパクション境界マーカー |
| `human_turn_complete` | 149 | ヒューマンターン完了マーカー |
| `tool_result` | 157 | ツール結果（result と別形式） |
| `tool_use` | 166 | ツール使用記録 |
| `stop_hook_summary` | 20 | Stop hook 実行結果 |
| その他 | 少数 | login, session_metadata 等 |

### 2.3 実ユーザーメッセージの識別

**決定的な識別子**: `permissionMode` フィールド

```jsonl
{"type":"user","permissionMode":"default","message":{"role":"user","content":[{"type":"text","text":"ユーザーの入力テキスト"}]},...}
```

- `permissionMode` が存在 → **実ユーザー入力**（27/216 = 12.5%）
- `permissionMode` が不在 → ツール結果、system メッセージ等
- 値: `"default"` または `"acceptEdits"`

**重要**: 1614 行中、実ユーザーメッセージはわずか 27 行（1.7%）。正確なフィルタリングが不可欠。

### 2.4 Interrupt の識別

```jsonl
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]},...}
```

- `permissionMode` フィールドなし（CLI が自動注入）
- テキストパターン: `"[Request interrupted by user]"` または `"[Request interrupted by user for tool use]"`

### 2.5 ターン構造

- `promptId`: ターンをグループ化
- `parentUuid`: 時系列チェーン
- `stop_reason: "end_turn"`: assistant レスポンス終了マーカー

### 2.6 Hook Input での利用可能性

`transcript_path` は `HookInputBase` で定義されており、**全 hook type で利用可能**:

```typescript
// src/signals/types.ts
export interface HookInputBase {
  session_id: string;
  transcript_path: string;  // ← 全 hook で利用可能
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}
```

現在 `session-end.ts` は `transcript_path` を使用していない → 追加する。

---

## 3. 提案アーキテクチャ: Transcript-Based Corrective Detection

### 3.1 設計方針

| 検討項目 | 決定 | 理由 |
|---------|------|------|
| 分類方法 | ローカル LLM（Ollama） | 会話の複雑さ、間接表現、文脈依存性 |
| リアルタイム vs バッチ | session-end バッチ | 完全なコンテキスト、シンプルな統合 |
| Precision vs Recall | High precision優先 | False positive は有害、false negative は現状維持 |
| フォールバック | interrupt 構造検出のみ | Ollama 不可時の graceful degradation |

### 3.2 パターンマッチを採用しない理由（設計決定 2026-04-04）

当初はキーワードパターンマッチ（3層: Structural/Lexical-Negation/Redirect）を検討したが、
以下の理由で却下:

1. **会話の複雑さ**: 「もう少し別のアプローチで考えてみましょう」のような婉曲表現はパターンで捕捉困難
2. **日本語の間接性**: 否定・修正の意図が明示的でないケースが頻出
3. **文脈依存**: 前のターンとの関係で初めて修正と分かるメッセージがある
4. **False positive リスク**: パターンの中途半端な精度は misleading な failure experience を生成する危険

### 3.3 ローカル LLM 分類アプローチ

**Primary**: Ollama API (`localhost:11434`) + 軽量モデル（gemma2:2b 等）
- transcript から human messages を抽出（決定的パース）
- 全メッセージを 1 回の推論で一括分類
- `temperature: 0` で再現性確保
- 推論時間: ~1-3s（Apple Silicon）

**Fallback**: interrupt 構造検出のみ（Ollama 不可時）
- interrupt 直後のメッセージ → corrective（confidence 0.9）
- その他 → 分類なし（見逃し許容）
- パターンマッチは使わない（中途半端な精度より見逃しの方が安全）

### 3.4 False Positive 抑制

- LLM の confidence threshold（default: 0.5）でフィルタリング
- セッション最初のメッセージは除外（corrective になり得ない）

### 3.5 統合ポイント

**変更前** (`session-end.ts`):
```
bootstrapHook → getSessionSummary → generate → embed → store
```

**変更後**:
```
bootstrapHook → parseTranscript → detectCorrections
  → signalStore.addSignal(corrective signals)
  → getSessionSummary (now includes corrective signals)
  → generate → embed → store
```

既存フローの前に transcript 解析を追加するだけで、下流のコンポーネントは変更不要。

---

## 4. 並行調査: Stop Hook ハング問題

### 4.1 症状
```
Osmosing... (running stop hooks... 7/8 · 11m 57s · ↓ 161 tokens)
```

8つの Stop hook のうち 7 番目で停止。

### 4.2 登録された Stop hooks（8つ）

| # | Plugin | Hook | Timeout |
|---|--------|------|---------|
| 1 | code | `dev-cycle-stop.sh` | 10s |
| 2 | code | `verify-workflow.sh` | 10s |
| 3 | CVI | `check-speak-called.sh` | 10s |
| 4 | ACM | `session-end.ts` (stop signal) | 5s |
| 5 | ACM | `session-end.ts` (experience gen) | 15s |
| 6 | ralph-loop | `stop-hook.sh` | **未指定** |
| 7 | hookify | hooks | 10ms（10） |
| 8 | project-local | `update_session_log.py` | 10s（修正済み） |

### 4.3 発見と修正

1. **`update_session_log.py` timeout**: `"timeout": 10`（10ms）→ `"timeout": 10000`（10s）に修正済み
2. **`verify-workflow.sh`**: 2026-04-04 に新規追加された 8 番目の hook。PR review state ファイルが存在する場合に transcript 全体を `cat` で読み込む
3. **hookify の timeout**: `"timeout": 10`（10ms）— Python インタプリタ起動に不十分だが、超過しても timeout で終了するはず

### 4.4 Issue 報告
- signalcompose/claude-tools に Issue #185 として報告済み
- `verify-workflow.sh` が最有力候補だが、間欠的な発生パターンから確定には至らず

---

## 5. 変更対象ファイル

### 新規作成
| File | Purpose |
|------|---------|
| `src/signals/transcript-parser.ts` | JSONL transcript 解析 |
| `src/signals/corrective-classifier.ts` | Ollama LLM 分類 + interrupt フォールバック |
| `tests/signals/transcript-parser.test.ts` | Parser テスト |
| `tests/signals/corrective-classifier.test.ts` | Classifier テスト |
| `tests/hooks/session-end-transcript.test.ts` | 統合テスト |

### 変更
| File | Change |
|------|--------|
| `src/hooks/session-end.ts` | transcript 解析 + corrective signal 記録 |
| `src/retrieval/injector.ts` | `formatSignalInstruction()` 削除 |
| `docs/SPECIFICATION.md` | Section 3.3 更新 |
| `CLAUDE.md` | 自己報告指示削除 |

### 変更なし（既存コンポーネント、正常動作）
| File | Role |
|------|------|
| `src/signals/types.ts` | `corrective_instruction` EventType は既存 |
| `src/signals/session-store.ts` | `addSignal()` をそのまま使用 |
| `src/signals/signal-collector.ts` | `getSessionSummary()` 変更不要 |
| `src/experience/scoring.ts` | `computeFailureStrength()` 変更不要 |
| `src/experience/generator.ts` | `generate()` 変更不要 |

---

## 6. 論文への影響

| Section | 変更内容 |
|---------|---------|
| Section 3 (Architecture) | Transcript-Based Corrective Detection を新コンポーネントとして記述 |
| Section 3.3 (Signal Detection) | 自己報告 → transcript 解析への変更を説明 |
| Section 4 (Signal Strength) | corrective_instruction_count が正確に計算されることを記述 |
| Section 5 (Experimental Design) | ACM-SF 条件が Control と実際に異なることを保証 |
| Section 6 (Threats to Validity) | パターンマッチの recall 限界を記述 |

---

## 7. リスク評価

| Risk | Mitigation |
|------|-----------|
| Transcript ファイルが大きい（MB 単位） | Streaming line-by-line 解析、必要な行のみ parse |
| session-end の 15s timeout 超過 | Parser は I/O bound（JSONL scan）で < 1s 想定 |
| LLM の言語カバレッジ不足 | ローカル LLM（gemma2:2b）に分類を委任。モデル変更は ollama_model 設定で制御可能 |
| False positive による misleading injection | High precision 方針 + configurable threshold |
| 既存テストの regression | 変更は additive（既存フローの前に transcript 解析を追加） |

---

## Conclusion

ACM の corrective instruction 検出は、Claude の自己報告に完全に依存しており、0% の成功率という結果に終わった。

当初はキーワードパターンマッチ（3層検出ロジック）を検討したが、会話の複雑さ、
日本語の間接的表現、文脈依存性を考慮し、ローカル LLM（Ollama）による分類に変更した。

Transcript JSONL の `permissionMode` フィールドで実ユーザーメッセージを抽出し、
Ollama の軽量モデル（gemma2:2b）で一括分類する方式により:
- パターンマッチでは捕捉できない婉曲な修正指示も検出可能
- `temperature: 0` で再現性を確保
- ローカル推論のため API コストゼロ、プライバシー保全
- Ollama 不可時は interrupt 構造検出にフォールバック

session-end hook で一括解析する方式は、既存アーキテクチャへの変更を最小限に抑えつつ、
failure experience 生成を有効化する。
