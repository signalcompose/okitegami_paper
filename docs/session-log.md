# ACM研究 セッションログ

## このドキュメントの目的

このドキュメントは本研究におけるAI協働プロセスの記録です。
何を根拠に論文のどこを更新したか、どのような議論から判断が生まれたかを追跡可能にするために存在します。
arXiv以降の時代の論文制作における知的所有権と協働プロセスの透明な記録として機能します。

---

## AI協働の構造

### Principal Investigator（研究責任者）

- 担当者: Yamato Hiroshi
- 役割:
  - リサーチクエスチョンの設定（RQ1〜RQ5）
  - コアアイデアの発案（ACMコンセプト、PTYシグナルの着眼点、インタラプトを最強シグナルとする洞察）
  - すべての判断と意思決定（arXiv戦略、先行研究との差別化、実装順序）
  - 実践からのフィードバック（実際にツールを使い、観察し、検証する立場）
  - 哲学的立場：実践・検証・仕組み化を優先する。AIとの協働を透明に記録することへのこだわり

### Strategist（戦略担当AI）

- ツール: Claude.ai（claude.ai のチャットインターフェース）
- 役割: プロジェクト全体の文脈・判断・戦略の保持。研究方向性の議論、意思決定の整理、議論の記録、Claude Code への指示書設計
- 特徴: セッションをまたいでプロジェクト記憶を保持する。ファイルへの直接書き込みは行わない

### Implementer（実装担当AI）

- ツール: Claude Code（okitegami_paper リポジトリ上で稼働）
- 役割: ファイル操作・調査・草稿更新・ADR 作成の実行エンジン
- 特徴: Strategist が設計したプロンプトを受け取り実行する。判断はしない

### ブリッジの仕組み

- Strategist がプロンプトを Implementer に渡す
- Implementer の出力をやまとさんが Strategist に共有する
- Strategist が Implementer の出力を評価し次の指示を設計する
- この session-log.md が両者の共有記憶として機能する

---

## セッション記録

### Session 001 — 2026-03-07〜08

主なトピック: 研究設計・先行研究調査・Phase 0 プローブ

#### 主要な意思決定

| 決定 | 根拠 | 記録場所 |
|-----|-----|---------|
| PTY インタラプトを最強シグナルに設定 | 最明確な否定シグナルであり直後の会話に理由が出る | acm-handoff.md |
| arXiv を Phase 0 後に出す | 実装可能性の証拠を1個入れてから出す方が強い | acm-handoff.md |
| ローカル LLM フォールバックは現時点で不要 | PostToolUseFailure.is_interrupt の存在を確認 | adr/0002 |
| 防御的公開を実装より先に行う | タイムスタンプによる prior art 確保が優先 | 本セッション議論 |

#### 重要な洞察（2026-03-08 の議論より）

**1. 手動ワークフローが ACM のユースケースそのもの**

claude.ai（Strategist）と Claude Code（Implementer）を人間がブリッジしながら使う現在の作業スタイルは、
ACM が自動化しようとしているものを手動でやっている状態である。

手動版（現在）:
  claude.ai → 文脈保持 → プロンプト生成 → Claude Code へ渡す
  人間がブリッジ役

自動化版（ACM）:
  MCP サーバー → 文脈保持 → 適切なタイミングで注入
  ブリッジを自動化

この観察は ACM 論文の Motivation セクションを strengthen する first-person evidence として使用可能。

**2. 実践から検証するという立場**

AI 批判や哲学的考察を優先するのではなく、実際に試して・壊して・仕組みに落とすことを優先する。
「実践の場からフィードバックする立場」がこの研究のスタンス。

**3. AI 協働論文の新しい形**

「AI が何をして、人間が何を判断したか」を構造として記述した論文はまだほぼ存在しない。
本研究は ACM の内容だけでなく、その制作プロセス自体が今後の研究の雛形になる可能性がある。

#### Phase 0 プローブ結果サマリー

- PostToolUseFailure.is_interrupt が公式 API に存在することを確認
- セッションログ（JSONL）から全会話・ツール使用・タイムスタンプが取得可能
- 詳細: adr/0002-phase0-probe-results.md

#### Implementer 作業記録（2026-03-08）

| 作業 | 内容 | 成果物 |
|-----|------|--------|
| 著者名調査 | Gemini CLI で TBD 3件の著者名を調査・補完 | draft v0.8 patch |
| AI Use Disclosure 追加 | Section 8 として AI 協働プロセスの開示セクションを追加 | draft v0.9 |
| Session-log 参照明確化 | session-log.md への参照を論文内で明確化 | draft v0.10 |
| Citation 整合性チェック | 本文 CITE タグ ↔ References セクションの双方向クロスチェック、URL 疎通確認 | 5件の bare CITE 修正、Letta Code URL 修正 |
| BibTeX ファイル作成 | 19件の参考文献を IEEEtran 互換 BibTeX エントリに変換 | docs/references.bib |
| IEEEtran LaTeX PDF 生成 | 英語版・日本語版の 2カラム学術論文フォーマット PDF を生成 | docs/pdf/acm-preprint-en.pdf (8p), docs/pdf/acm-preprint-ja.pdf (6p) |
| MemGPT 著者リスト修正 | Packer2023MemGPT の著者順修正、Stoica, Ion 追加 | references.bib 更新、PDF 再コンパイル |

##### 技術的な判断・対処

- **日本語 PDF フォント**: Noto Serif CJK JP 未インストールのため、macOS 標準の Hiragino Mincho ProN を使用（xeCJK 経由）
- **日本語版ページ数**: 初回生成時は要約版（4p）を作成してしまい、PI から指摘を受けて全文版（6p）に修正。CJK 文字の情報密度により英語版（8p）より少ないのは正常
- **BibTeX パス解決**: .tex ファイルが docs/pdf/ にあるため、`../references` の相対パスで docs/references.bib を参照
- **Letta Code URL**: `/letta-code` が 404 → `/blog/letta-code` に修正（curl -I で確認）

#### arXiv投稿試行（2026-03-08 後半）

| 作業 | 内容 | 結果 |
|-----|------|------|
| arXivアカウント設定 | username: dropcontrol, affiliation確認, primary: cs.SE | 設定完了 |
| 投稿カテゴリ決定 | Primary: cs.SE / Secondary: cs.AI / License: CC BY | 確定 |
| endorsement取得 | cs.SE初回投稿のためendorsement必要 / Code: JON6QM | ICMCグループに依頼済み・承認待ち |
| メール認証バグ | 認証コード3A3RHN-FFIY6N が「already been used」表示 / 投稿画面では認証警告が継続 | help@arxiv.org にサポート問い合わせ済み・返信待ち |

**ブロック状態：** endorsement承認 + メール認証解決の両方が揃うまで投稿不可

#### 戦略的意思決定（2026-03-08 後半）

| 決定 | 根拠 |
|-----|-----|
| 実装なしのワークショップ投稿は避ける | 「実装は？」という指摘を受ける前に実装で結果を出す |
| ターゲット学会をASE 2026に設定 | CORE A・コーディングエージェント自動化がど真ん中・2026年10月Munich |
| arXiv投稿後に実装フェーズ移行 | タイムスタンプ確保後、Claude Codeで実装速度を出す |

**ASE 2026締切:** 2026-03-26（今サイクルは間に合わない。次サイクルを狙う）

#### session-logとACMの関係についての観察（2026-03-08）

session-logが最新でないと、Strategist→Implementerのブリッジの質が落ちる。
これは「コンテキストが切れると文脈を失う」問題そのものであり、
ACMが自動化しようとしている課題を手動でやっている状態の不完全さとして現れている。

→ ACM論文のMotivationセクションを補強するfirst-person evidenceとして記録。

#### Auto-logged: 2026-03-08 11:49 (session: 570508cc)

編集ファイル:
- .claude/hooks/update_session_log.py
- .claude/settings.local.json

---

#### Auto-logged: 2026-03-08 11:49 (session: 570508cc)

編集ファイル:
- README.md

---

#### Auto-logged: 2026-03-08 11:54 (session: 570508cc)

編集ファイル:
- docs/acm-preprint-draft.md
- README.md

---

#### Auto-logged: 2026-03-08 12:18 (session: 570508cc)

編集ファイル:
- .gitignore

---

#### Auto-logged: 2026-03-08 13:38 (session: 570508cc)

編集ファイル:
- CLAUDE.md

---

#### Auto-logged: 2026-03-08 14:20 (session: 0871977b)

編集ファイル:
- .claude-plugin/plugin.json

---

#### Auto-logged: 2026-03-08 14:22 (session: 0871977b)

編集ファイル:
- /Users/yamato/.claude/projects/-Users-yamato-Src-proj-okitegami-okitegami-paper/memory/MEMORY.md

---

#### SQLite採用の議論（2026-03-08）

Experience StoreにSQLite + ベクトル埋め込みを採用することについて、Strategistと議論した。

**議論の経緯:**
- Boris Cherny（Claude Code開発者）がRAGよりAgentic Search（grep/glob）が優れていると述べている
- 「Claudeがテキストファイルをセマンティックに読める」ため、全件テキスト注入でもセマンティック検索は不要では？という問い

**結論: SQLiteで進める**

全件テキスト注入は経験が少ないうちは成立するが、セッションを重ねて経験が蓄積されるほどコンテキストウィンドウを圧迫する。ACMのtop-K絞り込みはまさにその問題への回答であり、SQLite + セマンティック検索は正当化される。

BorisのAgentic SearchとACMは矛盾しない：
- 経験が少ない段階 → テキスト全件注入で十分
- 経験が蓄積された段階 → ACM（top-K絞り込み）に移行

ACMの存在意義はコンテキストウィンドウ問題そのものへの回答であり、スケールする設計として正しい。

---

#### Auto-logged: 2026-03-08 14:22 (session: 0871977b)

編集ファイル:
- docs/session-log.md

---

### Session — 2026-03-11

主なトピック: Phase 6-D 決定（Task D: 2D Dungeon Generator）

#### Milestone 6-A 実験結果

| Task | Control | ACM-SF | 差 |
|------|---------|--------|-----|
| A (bugfix) | 1.000 | 1.000 | 0.000 (天井効果) |
| B (feature) | 1.000 | 1.000 | 0.000 (天井効果) |
| C (refactor) | 0.912 | 0.863 | -0.049 (仮説と逆) |

Task A/B は天井効果により ACM の効果測定不可。Task C は ACM-SF が Control を下回った（injection noise 仮説）。

#### Phase 6-D の決定

**判断**: アルゴリズム的に複雑なタスク（2D Dungeon Generator）を追加し、completion_rate が 0.5–0.8 に分布する難易度を目指す。

**設計上の議論**:
- Implementer が「Task D は ACM の cross-session 学習が有効に機能するかが不確実」と指摘
- 必要条件（天井効果の回避）は満たす可能性があるが、十分条件（ACM が有利に働く構造）は保証されない
- Strategist が「セッションごとに異なるダンジョンタイプを課題にする」案を提案
- 段階的アプローチを採用: まず現行プラン（同一タスク反復）で実行し、結果を見て改善

**重要な注記**: これは探索的な追試であり、null result も「アルゴリズム実装タスクでは ACM の効果が限定的」という知見として有意義。

#### 実装

Issues #49-#53 作成、PR #54 で実装。
- #49: scaffold dungeon generator task directory
- #50: 23 test cases for dungeon generation constraints
- #51: TASK.md and SOLUTION.md
- #52: runner infrastructure (task-d support)
- #53: ROADMAP and SPECIFICATION update

コードレビュー 2 round で 4 件の Important を修正（boss room test bound, cross-type test fragility, PRNG float divisor, dead-end adjustment logic）。

---

#### Auto-logged: 2026-03-11 08:31 (session: 7a6e79ad)

編集ファイル:
- docs/session-log.md
- docs/ROADMAP.md

---

#### Auto-logged: 2026-03-11 09:24 (session: 7a6e79ad)

編集ファイル:
- experiments/runner/session-orchestrator.ts

---

#### Auto-logged: 2026-03-11 09:37 (session: 7a6e79ad)

編集ファイル:
- docs/SPECIFICATION.md
- .claude/plans/scalable-drifting-walrus.md

---

### ACM Experience Quality Improvement + Task C Re-experiment (2026-03-11)

#### 経験エントリ品質の問題

Milestone 6-A（exp_6ac）の acm-sf 条件で null result が出た。DB 調査の結果:
1. outcome が `"Task incomplete: 75% test pass rate"` のみで actionable 情報がない
2. action に CVI Voice 出力が混入（`"Agent attempted task: Voice: ..."`）
3. vitest JSON は取得済みだが経験生成に渡されていなかった

#### 改善内容（PR #54 に含む）

- `parseVitestOutput()`: vitest JSON を1回だけ parse し、失敗テスト名を抽出
- `extractFailedTests()`: 失敗テスト名を最大5件収集
- `stripCviContent()`: CVI Voice パターンを除去
- `buildOutcome()`: 失敗時 `"Failed tests: xxx. 6/8 passed."`、成功時 `"All tests passed (8/8)."`
- 17 新テスト追加（379件全パス）

#### 再実験結果（exp_6ac_improved）

| 条件 | s1 | s2 | s3 | s4 | s5 | mean | std |
|------|------|------|------|------|------|------|-----|
| control | 0.9375 | 0.9375 | 0.9375 | 0.9375 | 0.9375 | 0.938 | 0.000 |
| acm-sf | 1.0000 | 0.9375 | 0.9375 | 0.9375 | 0.9375 | 0.950 | 0.028 |

- ACM-SF が +0.012 だが、s1 の 1 セッションのみの差
- Task C は天井効果が強い（baseline 0.9375）
- 経験エントリの outcome は改善済み: `"All tests passed (11/11)."`
- action は `"(no output)"` — `claude --print` の stdout が空のため

#### 改善前後の注入テキスト比較

**改善前（exp_6ac）**: 注入なし（null result のため s2 以降で experience が蓄積されなかった）

**改善後（exp_6ac_improved）**: s2 以降で 376→713→1050→1387 chars の injection が正常に蓄積

---
