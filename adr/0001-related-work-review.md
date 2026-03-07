# ADR 0001: Related Work Review -- ACM Differentiation Analysis

**Date:** 2026-03-08
**Status:** Reviewed
**Author:** Claude Code (on behalf of Yamato Hiroshi)

## Context

ACMの核心的差別化ポイントを脅かす先行研究が存在しないかを網羅的に調査した。
特に以下2点が未踏であることの確認を目的とする：

1. PTYインタラプト（Ctrl+C）＋直後の会話をメモリ品質シグナルとして使う研究
2. コーディングエージェント特化の失敗体験付き外部メモリの研究

## 調査対象論文

### REMEMBERER (arXiv:2306.07929, NeurIPS 2023)

- **内容：** LLMをsemi-parametric RLエージェントとして扱い、エピソード記憶テーブル（タスク記述・観察・行動・Q値）をRLEM（Reinforcement Learning with Experience Memory）で更新。成功・失敗両方から学習。WebShop、WikiHowで評価。
- **ACMとの関係：** 部分的脅威（失敗学習あり）だが実質的脅威なし
- **理由：** 失敗学習はQ値伝播によるRL更新であり、PTY行動シグナルの直接キャプチャではない。評価対象はWebショッピング・料理手順であり、コーディングエージェントではない。ACMの「インタラプト＋直後の会話」というシグナルタクソノミーとは根本的に異なる。
- **重要：** 草稿のarXiv IDが誤り。`2312.17190`は量子物理の論文（"Coherent interaction-free detection of noise"）。正しいIDは`2306.07929`。修正必須。

### A-MAC: Adaptive Memory Admission Control (arXiv:2603.04549, 2026)

- **内容：** メモリ価値を5つのシグナル（future utility, factual confidence, semantic novelty, temporal recency, content type prior）に分解。LoCoMoベンチマークで評価。Workday AI所属。F1=0.583、レイテンシ31%削減。
- **ACMとの関係：** 脅威なし
- **理由：** 汎用会話メモリの入場制御。PTY行動シグナルを使わない。コーディングタスクを対象としない。5つのシグナルはすべてテキスト・メタデータベースであり、行動ベースのシグナル（インタラプト、rewind）を含まない。ACMとは直交する設計空間。

### Self-Generated In-Context Examples (arXiv:2505.00234, NeurIPS 2025)

- **内容：** 成功したタスク軌跡を自動蓄積し、将来のタスクのin-context examplesとして使用。ALFWorld 73%→89%（最終93%）、Wordcraft 55%→64%、InterCode-SQL 75%→79%。
- **ACMとの関係：** 脅威なし（補完的）
- **理由：** 成功体験のみ蓄積（失敗を含まない）。PTYシグナルを使わない。コーディングエージェント特化ではない。ただし「体験ベースメモリが有効」というACMの前提を強く支持する論文であり、Related Workで「ACMはこのアプローチを拡張する」と位置づけるのが適切。
- **重要：** 草稿に記載の`arXiv:2410.08925`付近では見つからず。正しいIDは`2505.00234`。確認・修正推奨。

### A-MEM: Agentic Memory for LLM Agents (arXiv:2502.12110, 2025)

- **内容：** LLMエージェント向けの動的メモリシステム。ノート自動生成・リンク生成によるグラフベースのメモリ組織化。固定操作・構造の限界を克服。
- **ACMとの関係：** 脅威なし
- **理由：** メモリエントリの成功・失敗による重み付けなし。PTYシグナルを使わない。コーディング特化でない。メモリの「構造化」に焦点があり、ACMの「品質シグナルによるスコアリング」とは異なるアプローチ。

### Letta Code (ブログ/GitHub, 2025-2026)

- **内容：** MemGPT/Lettaアーキテクチャベースのmemory-firstコーディングエージェント。Terminal-Bench 4位（全体）、2位（Claude 4 Sonnet使用エージェント中）。200行以下のコードで実装。2026年にはContext Repositories（git-basedメモリ）を導入。
- **ACMとの関係：** 部分的脅威だが差別化は維持
- **理由：** 唯一のコーディングエージェント特化メモリシステム。ただしPTY行動シグナルをメモリ品質指標として利用していない。Lettaのメモリはコンテキストのページング（RAM↔ディスク）であり、ACMの「成功/失敗体験の分類・スコアリング」とは設計思想が異なる。Context Repositoriesもgit-based永続化であり、インタラプトシグナルベースの品質判定は含まない。
- **注意：** 正式な学術論文は未発表（ブログとGitHubのみ）。

## PTYシグナル検索結果

### クエリ: `"interrupt signal" LLM agent memory`
- 上位件数：10件確認
- 関連論文：LangGraphのinterrupt機能（ワークフロー制御、メモリ品質シグナルではない）、MemGPTのevent-driven interrupts（メモリページング用、品質シグナルではない）
- 脅威論文：なし
- 結論：調査済み・差別化脅威なし

### クエリ: `PTY terminal coding agent feedback`
- 上位件数：10件確認
- 関連論文：Deep RL with Implicit Human Feedback（EEGベース、PTYではない）、Endless Terminals（RL訓練環境、メモリシグナルではない）
- 脅威論文：なし
- 結論：調査済み・差別化脅威なし

### クエリ: `implicit feedback coding agent reinforcement`
- 上位件数：10件確認
- 関連論文：DeepSWE（テストスイートによるバイナリ報酬でRL訓練、PTYシグナルではない）、Endless Terminals（合成タスクでPPO訓練）、Cider Chat study（暗黙的感情分析、PTYレベルではない）
- 脅威論文：なし
- 結論：調査済み・差別化脅威なし

### クエリ: `user interrupt stop signal LLM`
- 上位件数：10件確認
- 関連論文：AsyncVoice Agent（音声インタラプション、PTYではない）、Sara Zan blog "Can you really interrupt an LLM?"（技術的考察記事、メモリシステムではない）
- 脅威論文：なし
- 結論：調査済み・差別化脅威なし

### クエリ: `behavioral signal LLM coding assistant`
- 上位件数：10件確認
- 関連論文：How Memory Management Impacts LLM Agents (2505.16067)（experience-following特性の実証、ACM補完的）、A-MAC（前述）、MemOS（メモリOS、汎用）
- 脅威論文：なし
- 結論：調査済み・差別化脅威なし

**PTY検索総合結論：** 5クエリ×上位件数を調査し、PTYインタラプト＋直後の会話をメモリ品質シグナルとして利用する研究は1件も発見されなかった。ACMのシグナルタクソノミーは新規性を維持している。

## 最新動向検索結果

### クエリ: `coding agent memory cross-session 2025 2026`
- 上位件数：10件確認
- 注目論文：
  - Cross-Session Narrative Memory (CSNM)（academia.edu, 汎用認知アーキテクチャ、コーディング特化でない、PTYなし → 無関係）
  - Memory in the Age of AI Agents (arXiv:2512.13564, サーベイ論文 → 補完）
  - Letta Code / Context Repositories（前述 → 部分的脅威だが差別化維持）
- 脅威論文：なし

### クエリ: `LLM agent episodic memory software development`
- 上位件数：10件確認
- 注目論文：
  - ICLR 2026 Workshop MemAgents（メモリ研究ワークショップ提案 → ACMの発表先候補として有用）
  - MemRL: Self-Evolving Agents via Runtime RL on Episodic Memory (2026/01)（RL更新、汎用、PTYなし → 無関係）
  - MemEvolve: Meta-Evolution of Agent Memory Systems (2025/12)（メタ進化、汎用 → 無関係）
- 脅威論文：なし

### クエリ: `context window dependency coding agent`
- 上位件数：10件確認
- 注目論文：
  - GAM: General Agentic Memory (arXiv:2511.18423, 2025)（Memorizer+Researcher dual-agent、JITコンテキスト構築。RULERで90%超。汎用メモリ、PTYなし、コーディング特化でない → 無関係）
  - Codified Context (arXiv:2602.20478)（コードベースのコンテキストインフラ → 補完的、Serenaに近い）
  - Git Context Controller (arXiv:2508.00031)（gitベースコンテキスト管理 → 補完的）
- 脅威論文：なし

### クエリ: `failure experience memory LLM agent`
- 上位件数：10件確認
- 注目論文：
  - How Memory Management Impacts LLM Agents (arXiv:2505.16067)（experience-following特性を実証。誤った経験がエラー伝播を引き起こすことを示す。ACMの「失敗体験の品質管理が重要」という主張を強く支持 → 補完的）
  - From Experience to Strategy (arXiv:2511.07800)（グラフベース経験メモリ、汎用 → 無関係）
  - Reflexion / Expel（自己反省・再利用可能な推論軌跡。汎用、PTYなし → 無関係）
- 脅威論文：なし

### クエリ: `MCP memory server coding agent`
- 上位件数：10件確認
- 注目実装：
  - mcp-memory-service（オープンソース永続メモリMCPサーバー）
  - Dalexor MI（MCPサーバー、"Goldfish Effect"対策）
  - OpenMemory by Mem0（共有メモリMCPサーバー）
  - Mono Memory MCP（SQLiteベースチーム共有メモリ）
- 学術論文：なし（すべてOSS/ブログ）
- 脅威：なし。いずれもPTYシグナルベースの品質スコアリングを実装していない。汎用的な「保存＋検索」であり、ACMの「シグナル強度に基づく経験分類」とは異なる。

**最新動向総合結論：** 5クエリ×上位件数を調査し、ACMの差別化を直接脅かす論文は発見されなかった。メモリ研究は活発だが、PTY行動シグナル × コーディングエージェント特化 × 失敗体験スコアリングの組み合わせは未踏。

## 追加発見：注目すべき補完的研究

### How Memory Management Impacts LLM Agents (arXiv:2505.16067, 2025)
ACMの設計を理論的に支持する論文。「経験追従特性（experience-following property）」を実証し、メモリの品質管理が長期性能に直結することを示す。Section 2に追加引用を推奨。

### GAM: General Agentic Memory (arXiv:2511.18423, 2025)
JITコンテキスト構築という独自のアプローチ。ACMと直交する設計だが、「外部メモリによるコンテキスト依存低減」という大枠の議論で言及可能。

### ICLR 2026 MemAgents Workshop
ACMの発表先候補として検討価値あり。

### Building AI Coding Agents for the Terminal (arXiv:2603.05344, 2026)
ターミナルベースコーディングエージェントの構築に関する最新論文。メモリシステムの議論は含まないが、ACMの対象環境を記述する参考文献として有用。

## 未解決引用の解決

### Context Rot (Chroma Research 2025)
- 正式タイトル：Context Rot: How Increasing Input Tokens Impacts LLM Performance
- 著者：Chroma Research
- URL：https://research.trychroma.com/context-rot
- GitHub：https://github.com/chroma-core/context-rot
- 発表形式：テクニカルレポート（査読なし）
- 内容確認：18モデル（GPT-4.1, Claude 4, Gemini 2.5, Qwen3含む）を評価。3つのメカニズム（lost-in-the-middle, attention dilution, distractor interference）を特定。1Mトークンウィンドウでも50kトークン時点で劣化発生。
- 推奨引用形式：
```
Chroma Research. Context Rot: How Increasing Input Tokens Impacts LLM Performance.
Technical Report, 2025. https://research.trychroma.com/context-rot
```
- 草稿のURL既に正しい（371行目）。

### Geoffrey Huntley / Smart Zone
- ソース種別：YouTube Live配信 + ブログ記事群
- 人物：Geoffrey Huntley (@ghuntley)、Sourcegraph/Amp所属エンジニア。Ralph Wiggum Techniqueの考案者。
- 主要URL：
  - YouTube Live: https://www.youtube.com/live/fOPvAPdqgPo（草稿記載のもの）
  - ブログ（コーディングエージェント解説）: https://ghuntley.com/agent/
  - Ralph Technique: https://ghuntley.com/ralph/
- 「Smart Zone（40%）」の出典：ghuntley.com/agent のコーディングエージェント解説で「Claude 3.7の200kウィンドウは147k-152kで品質が低下する」と記述。正確には「最初の40%」という定式化はHuntley独自の主張であり、Chroma Researchの定量データとは別。
- 推奨引用形式：
```
Huntley, G. How to Build a Coding Agent. Blog post, 2025.
https://ghuntley.com/agent/
```
- 注意：「ai that works」はBoundary ML（BAML）のポッドキャスト名。Huntleyがゲスト出演した回が存在するが、正確なエピソード特定には追加調査が必要。草稿395行目のYouTube URLは有効だが、ポッドキャスト名「ai that works」はBAMLのものであり、Huntley個人のものではない可能性がある。

## 結論

ACMの差別化ポイント（PTYインタラプトシグナル x コーディングエージェント特化失敗体験メモリ）を直接脅かす先行研究は **発見されなかった**。

具体的に：

1. **PTYインタラプト＋直後の会話をメモリ品質シグナルとして使う研究**：5クエリ×上位件数を調査し、0件。LangGraphのinterruptはワークフロー制御、MemGPTのevent-drivenはページング用であり、いずれもメモリ品質判定のシグナルとしてインタラプトを使っていない。

2. **コーディングエージェント特化の失敗体験付き外部メモリ**：Letta Codeが唯一のコーディングエージェント特化メモリだが、失敗体験のスコアリング・PTYシグナル活用は含まない。REMEMBERERがQ値ベースの失敗学習を持つが、コーディング特化でなくPTYシグナルも使わない。

**ACMの「PTYインタラプトシグナル x 失敗体験スコアリング x コーディングエージェント特化」という3軸の組み合わせは、調査範囲内で未踏である。**

## 次のアクション

- [ ] acm-preprint-draft.md: REMEMBERERのarXiv IDを`2312.17190`→`2306.07929`に修正
- [ ] acm-preprint-draft.md: Self-Gen ICEのarXiv IDを`2410.08925`→`2505.00234`に修正確認
- [ ] acm-preprint-draft.md Section 2: How Memory Management Impacts LLM Agents (2505.16067) を追加引用（experience-following特性がACMの設計根拠を支持）
- [ ] acm-preprint-draft.md Section 2: GAM (2511.18423) を追加言及（外部メモリの有効性の追加エビデンス）
- [ ] acm-preprint-draft.md: Geoffrey Huntley引用をブログURL（ghuntley.com/agent）に更新検討
- [ ] acm-preprint-draft.md Section 2の[CITE]を正式引用で埋める
- [ ] ICLR 2026 MemAgents Workshopを発表先候補として検討
- [ ] 必要に応じて差別化の記述を強化（PTYシグナルの新規性を更に明確化）
