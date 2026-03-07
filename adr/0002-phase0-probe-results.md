# ADR 0002: Phase 0 Probe Results -- ACM Implementation Feasibility

**Date:** 2026-03-08
**Status:** Completed
**Author:** Claude Code (on behalf of Yamato Hiroshi)

## Summary

| 検証項目 | 結果 | 備考 |
|---------|------|------|
| セッションログ取得 | ✓ 可能 | JSONL形式、全会話・ツール使用が記録 |
| rewindイベント検知 | △ 部分的 | 直接的なhookはないが、セッションログ解析で検知可能 |
| PTY SIGINTキャプチャ | ✓ 可能 | `PostToolUseFailure`の`is_interrupt`フィールドで取得可能 |
| インタラプト後会話キャプチャ | ✓ 可能 | セッションログのターン構造＋タイムスタンプから特定可能 |
| コンテキスト使用量取得 | △ 部分的 | セッション終了時のトークン量は`.claude.json`で取得。リアルタイムは不可 |

## 検証1：セッションログ取得

- **結果：** ✓ 可能
- **ログの場所：** `~/.claude/projects/<project-path-encoded>/<session-id>.jsonl`
  - 例: `~/.claude/projects/-Users-yamato-Src-proj-okitegami-okitegami-paper/570508cc-3690-452f-aa56-e0fba4c15f98.jsonl`
- **形式：** JSONL（1行1JSONオブジェクト）
- **含まれる情報：**
  - `type`フィールドで分類: `user`(78件), `assistant`(105件), `progress`(372件), `system`(9件), `file-history-snapshot`(6件) — 現セッションの実測値
  - 各エントリに含まれるフィールド: `sessionId`, `timestamp`(ISO 8601), `uuid`, `parentUuid`, `cwd`, `version`, `gitBranch`, `userType`
  - `message`フィールド内に`role`（user/assistant）、`content`（テキスト/tool_use/tool_result）
  - ツール使用: `tool_use`（ツール名、入力パラメータ）と`tool_result`（実行結果）が対応付けて記録
  - `subtype`: `local_command`, `stop_hook_summary`, `turn_duration`, `bridge_status`等
- **ACM実装への影響：** セッションログから会話履歴・ツール使用パターン・タイムスタンプを完全に取得可能。ACMの経験エントリ生成に必要な情報は十分に含まれている。hooks APIの`transcript_path`フィールドでログファイルパスも自動取得可能。

## 検証2：rewindイベント検知

- **結果：** △ 部分的
- **検知方法：**
  - Claude Code hooks APIに`Rewind`専用のイベントは存在しない（17種のhookイベント中にRewindなし）
  - ただしセッションログ解析で間接的に検知可能：rewindが発生するとセッションログのターンが巻き戻され、新しいターンが追加される。タイムスタンプの不連続やメッセージの消失パターンから推定可能
  - デバッグログ（`~/.claude/debug/`）では `control_cancel_request` としてキャプチャされている
- **フックの有無：**
  - `SessionStart`の`source`フィールドに`compact`や`clear`はあるが`rewind`はない
  - `SessionEnd`の`reason`にも`rewind`は含まれない
  - `PreCompact`は`manual`/`auto`のみでrewindとは別
- **ACM実装への影響：** rewindの直接フックは不可だが、以下の代替手段がある:
  1. **セッションログの差分監視**: `PostToolUse`や`Stop` hookでtranscript_pathを読み、前回チェックポイントからのメッセージ数減少を検知
  2. **会話テキストパターンマッチ**: ユーザーの修正指示テキスト（「違う」「やり直して」等）を`UserPromptSubmit` hookで検知
  3. **フォールバック**: rewindをLevel 2シグナルからLevel 3（修正指示テキスト）に統合し、テキストベースの検知に一本化

## 検証3：PTY SIGINTキャプチャ

- **結果：** ✓ 可能
- **取得方法：**
  1. **`PostToolUseFailure` hookの`is_interrupt`フィールド**（公式API）: ツール実行中にユーザーがインタラプト（Ctrl+C / Esc）した場合、`is_interrupt: true`が設定される。これはClaude Code公式のhooks APIドキュメントに明記されている。
  2. **デバッグログ**: `~/.claude/debug/<session-id>.txt`に`control_cancel_request`、`[onCancel]`、`Aborting: tool=<tool_name>`が記録される。`streamMode`（`tool-use` / `responding`）で中断箇所を特定可能。
  3. **`Stop` hookの不発火**: 公式ドキュメントに「Stop hookはユーザーインタラプトによる停止時には発火しない」と明記。つまりStop hookが発火しなかった場合、インタラプトが発生したと推定可能。
- **制約：**
  - `PostToolUseFailure`はツール実行中のインタラプトのみキャプチャ。テキスト生成中のインタラプト（ツール不使用時）はこのフックでは取れない
  - テキスト生成中のインタラプトは、Stop hookの不発火＋次のUserPromptSubmit発火の組み合わせで推定可能
- **ACM実装への影響：** `PostToolUseFailure`の`is_interrupt`フィールドにより、ACMのLevel 1シグナル（インタラプト）の最も重要な部分が公式APIで取得可能。これは予想以上に好条件。ACM MCPサーバーは`PostToolUseFailure` hookでインタラプトイベントを監視し、`is_interrupt: true`をトリガーとして失敗エントリの生成を開始できる。

## 検証4：インタラプト後会話キャプチャ

- **結果：** ✓ 可能
- **ターン構造：**
  - セッションログはJSONL形式で各行が1イベント
  - 各エントリに`timestamp`（ISO 8601ミリ秒精度）、`type`（user/assistant/progress/system）、`uuid`、`parentUuid`
  - `message.role`でuser/assistantを区別
  - `message.content`は配列形式で`text`, `tool_use`, `tool_result`, `thinking`等の型を含む
- **インタラプトとの対応：**
  - `PostToolUseFailure`（`is_interrupt: true`）のタイムスタンプ以降の`user`タイプエントリを抽出すれば、インタラプト後N=3〜5ターンの会話を取得可能
  - `transcript_path`フィールドによりログファイルのパスはhookから直接取得可能
  - ターンの時系列順序はタイムスタンプで保証されている
- **ACM実装への影響：** `PostToolUseFailure`（`is_interrupt: true`）発火 → `transcript_path`からセッションログ読み込み → インタラプト後N=3〜5ターンのuserメッセージを抽出 → 失敗エントリの`interrupt_context`として記録、というパイプラインが実現可能。`UserPromptSubmit` hookで後続のユーザー入力をリアルタイムにキャプチャすることも可能。

## 検証5：コンテキスト使用量取得

- **結果：** △ 部分的
- **取得方法：**
  - `~/.claude.json`の`projects`セクションにプロジェクト単位でトークン使用量が記録:
    - `lastTotalInputTokens`: 最終セッションの入力トークン数
    - `lastTotalOutputTokens`: 最終セッションの出力トークン数
    - `lastTotalCacheCreationInputTokens`: キャッシュ作成トークン数
    - `lastTotalCacheReadInputTokens`: キャッシュ読み取りトークン数
    - `lastModelUsage`: モデル別の詳細使用量（inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, webSearchRequests, costUSD）
    - `lastCost`: セッションコスト（USD）
  - 実測値（本プロジェクト）: inputTokens=11, outputTokens=672, cacheRead=121252, cacheCreation=36385
- **リアルタイム性：**
  - `.claude.json`はセッション終了時に更新。セッション中のリアルタイムトークン使用量は直接取得不可
  - hooks APIにトークン使用量を含むフィールドは存在しない
  - `progress`タイプのログエントリにも直接的なトークン使用量は含まれない
- **ACM実装への影響：**
  - セッション終了時のトークン使用量は取得可能 → RQ4（コンテキスト制限条件での評価）に使用可能
  - リアルタイムのコンテキスト使用量モニタリングはAPIでは不可 → 代替手段:
    1. `PostToolUse` hookでtranscript_pathのファイルサイズを定期的にチェック（間接的な推定）
    2. `PreCompact` hookでコンパクション直前のトークン量を推定（auto-compactが128kに近い時に発火）
    3. 実験設計で固定トークンバジェットを設定し、セッション終了時の使用量で事後的に評価

## 総合判定

### フルACM実装の実現可能性: 高い

5項目中3項目が✓（完全に可能）、2項目が△（部分的に可能・代替手段あり）。

**最も重要な発見**: `PostToolUseFailure`の`is_interrupt`フィールドの存在。これはClaude Code公式APIがユーザーインタラプトを明示的にフラグとして提供していることを意味し、ACMの核心機能（Level 1シグナルのキャプチャ）がネイティブにサポートされている。

### 推奨アーキテクチャ

```
[ACM MCP Server]
  ├── PostToolUseFailure hook (is_interrupt=true → 失敗エントリ生成開始)
  ├── UserPromptSubmit hook (インタラプト後N=3〜5ターン キャプチャ)
  ├── PostToolUse hook (修正指示テキストパターン検知)
  ├── Stop hook (正常完了 → 成功エントリ候補)
  ├── SessionEnd hook (セッション終了 → エントリ確定・保存)
  └── SessionStart hook (ACMコンテキスト注入)
```

### フォールバックが必要な項目

#### rewindイベント（△）
- **代替手段1**: `UserPromptSubmit` hookで修正パターンテキストを検知（「やり直し」「違う」「取り消し」等）
- **代替手段2**: セッションログのメッセージ数減少を`PostToolUse` hookで定期的にチェック
- **論文での扱い**: rewindをシグナルタクソノミーのLevel 2からLevel 3（修正指示テキスト）と統合するか、Claude Code固有の制約として記述

#### リアルタイムコンテキスト使用量（△）
- **代替手段**: `PreCompact` hookでauto-compact発火をトリガーとして使用（128k付近で発火）
- **論文での扱い**: RQ4はセッション終了時の使用量で事後的に評価。リアルタイムモニタリングは将来課題

### ローカルLLMフォールバックの要否

Claude Code APIでのACM実装が十分に実現可能であるため、ローカルLLM（Llama / Qwen）へのフォールバックは**現時点では不要**。ただし以下の理由でフォールバック設計は維持すべき:

1. **再現性**: 査読者がClaude Code APIアクセスなしで実験を再現するため
2. **汎用性**: 「モデル非依存のアーキテクチャ」という論文の強みを維持するため
3. **ローカルLLM版**: open-interpreter / Aider等のOSSコーディングエージェントでPTYレベルのSIGINTを直接キャプチャ可能（Claude Code APIより簡単）

## acm-handoff.md への更新推奨事項

Phase 0完了により、以下の更新を推奨:

### 「6. Phase 0で確認すること」のチェックリスト更新

```
確認項目：
  [✓] Claude CodeのAPIからセッションログを取得できるか → JSONL形式で取得可能
  [△] rewindイベントをMCPフックで検知できるか → 直接フックなし、テキストパターンで代替
  [✓] PTYレベルのインタラプト（SIGINT）を取得できるか → PostToolUseFailure.is_interrupt
  [✓] インタラプト後Nターンの会話をキャプチャできるか → transcript_path + timestamp
  [△] コンテキスト使用量（/context相当）をAPIで取れるか → セッション終了時のみ

フォールバック判定：
  → Claude Code APIでの実装が実現可能。ローカルLLMは再現性目的で並行設計。
```

### 草稿 v0.4 への反映事項

1. Section 3 (ACM Framework): hooks APIベースの具体的なアーキテクチャを記述
2. Section 4 (Signal Taxonomy): `PostToolUseFailure.is_interrupt`を根拠としてLevel 1シグナルの取得可能性を明記
3. Section 5 (Experimental Design): hooks APIを利用した実験実装の詳細を追加
4. Section 6 (Limitations): rewindの直接フック不在とリアルタイムトークン監視の制約を記述
