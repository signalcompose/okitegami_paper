# Research: ACM 評価設計の再検討

## 調査日
2026-04-14

## 調査目的

Phase 6-A の実験結果（天井効果）を受け、ACM の評価設計を根本的に再検討する。
既存ベンチマークの調査、評価指標の見直し、新しい実験設計の策定。

## 調査方法

- arXiv paper-search MCP による論文検索
- Codex CLI による評価設計レビュー
- SWE-Bench-CL 論文（arXiv:2507.00014）全文精読
- ACM 論文 Section 5（Experimental Design）との対照分析

## 背景: Phase 6-A の結果と問題

Phase 6-A の自動実験結果:

| タスク | Control | ACM-SF | 問題 |
|--------|---------|--------|------|
| Task A | 1.000 | 1.000 | 天井効果 |
| Task B | 1.000 | 1.000 | 天井効果 |
| Task C | 0.938 | 0.950 | +1.25%, 有意差なし |

### 構造的問題（天井効果以外）

1. **生態学的妥当性の欠如**: `claude --print` は非対話型。ACM の PTY signals（interrupt, corrective instruction）が発生しない。retrieval-injection パイプラインのシミュレーションのみ。
2. **タスク難易度の未較正**: Tasks A/B/C は事前パイロットなしに設計。
3. **統計的検出力の不足**: 5 セッション × 7 条件では中程度の効果量を検出できない。
4. **SWE-bench 棄却理由の矛盾**: 論文は SWE-bench を「single-session」として棄却するが、論文自身の自動実験も実質 single-session。

## 既存ベンチマーク調査結果

### SWE-Bench-CL (arXiv:2507.00014, Columbia University, 2025.06)

- **概要**: SWE-Bench Verified 上に構築された continual learning 用ベンチマーク
- **構成**: 8 Python リポジトリ、273 タスク、時系列 + 難易度カリキュラム順
- **メモリ**: FAISS ベース semantic memory（vectorize → store → retrieve → inject）
- **フレームワーク**: LangGraph ベースの独自エージェント
- **メトリクス**: ACC, Forgetting, Forward/Backward Transfer, AULC, TUE, CL-Score, CL-Fβ
- **CL-Fβ**: CL-Plasticity（即時学習能力）と CL-Stability（知識保持）の調和平均
- **Prompt poisoning 実験**: 無関係な記憶注入で semantic drift 約 0.45 — retrieval 品質が重要

**重要な発見**: 著者自身の実験で overall pass rate が 8.5% 以下。天井効果とは逆の**床効果**。
メモリ有効条件でも改善なし（失敗タスクの記憶が蓄積する garbage-in, garbage-out）。

**ACM との適合性**:
- メトリクス設計は優れている（CL-Fβ は ACM の RQ に直接マッピング可能）
- タスク難易度は問題（床効果リスク）
- プレプリント、査読未通過（Columbia 学生 3 名）

### ExpeL (AAAI 2024)

- **評価方法**: HotpotQA, ALFWorld, WebShop, FEVER で task success rate を測定
- **特徴**: experience pool の蓄積 + insight 抽出。ただし coding domain ではない
- **ACM との関係**: 方法論的に類似（experience pool → retrieval → injection）だがドメインが異なる

### Voyager (NeurIPS 2023)

- **評価方法**: Minecraft 内での unique items 獲得数、tech tree milestones
- **Cross-session**: skill library の cross-world transfer テストあり
- **ACM との関係**: skill library アーキテクチャが構造的に類似。ドメインが異なる

### LifelongAgentBench (arXiv 2025.05, ICLR 2026 submitted)

- **構成**: Database (SQL), OS (Bash), Knowledge Graph (SPARQL) の 3 環境
- **特徴**: タスク間依存関係あり。sequential skill accumulation を評価
- **発見**: 従来の experience replay は LLM agent には非効率

### その他

- **LongMemEval**: 長期会話メモリ評価。coding 非特化
- **LOCOMO (EMNLP 2023)**: 35 セッションにわたる多セッション対話記憶
- **Multi-SWE-bench**: 多言語版 SWE-bench
- **SWE-rebench**: 大規模・脱汚染版

## 検討した選択肢と評価

### 選択肢 A: SWE-Bench-CL メトリクスのみ借用、タスクは再設計
- メトリクス体系は優れているが、タスク難易度較正の問題が再発する
- Tasks A/B/C の失敗と同じ壁にぶつかる
- **判定: リスクが高い**

### 選択肢 B: SWE-Bench-CL をそのまま採用（強いモデルで床効果回避）
- 著者自身が 8.5% 以下の pass rate を報告。SWE-bench Verified SOTA でも約 50%
- 床効果で有意差が出ない可能性が高い
- **判定: 却下**

### 選択肢 C: SWE-Bench-CL + 改良タスクの二段構成
- B が使えないなら片足がない
- 複雑性だけ増えて benefit がない
- **判定: 却下**

### 選択肢 D (採用): 指標を変える
- **根本的洞察**: completion rate を主要指標にしている限り、Goldilocks zone（適切な難易度）を見つけなければならない。指標自体を変えることで天井/床効果を回避できる
- SWE-bench Verified のタスクをそのまま使用（較正済み、公開、peer-reviewed）
- Process metrics（token efficiency, attempt count, corrective instruction count）を主要指標に
- SWE-Bench-CL のメトリクス体系（forward transfer, CL-Fβ）を借用

## 採用した評価設計

### 二段構成

| 実験 | 方法 | 検証対象 |
|------|------|---------|
| **Exp 1: 自動** | SWE-bench Verified タスク × experiment runner | Retrieval-injection パイプラインの効果 |
| **Exp 2: 手動** | 同一条件 × 3 プロジェクト | Signal collection + 全パイプライン + process metrics |

### Exp 1: 自動実験（SWE-bench Verified）

- **タスク選択**: SWE-bench Verified から同一リポジトリのタスクを時系列順に抽出
- **実験実行**: 既存 experiment runner で実行
- **メトリクス**: SWE-Bench-CL の CL メトリクス体系 + process metrics
- **比較条件**: No memory / FAISS baseline / ACM

### Exp 2: 手動実験（同一条件 × 3 プロジェクト）

- **構造**: 同一テンプレートリポジトリから 3 プロジェクトを作成
  - Project A: Control（ACM なし）
  - Project B: ACM-SF（success + failure memory）
  - Project C: ACM-SF + 蓄積済み experience
- **タスク**: 同一タスクリスト（機能追加 + バグ修正）を各プロジェクトで実行
- **測定する process metrics**:
  - やりとり回数（user↔agent ターン数）
  - トークン消費量（セッションあたり total tokens）
  - Corrective instruction 数（ACM が自動検出）
  - Interrupt 数（Ctrl+C 中断頻度）
  - 初手の方向性（最初のアプローチが正しかったか — 手動評価）
  - セッション数（タスク完了に何セッション必要か）
  - Compact 回数（context window 消費量の proxy）

### なぜこの設計が機能するか

1. **天井/床効果を回避**: 全条件でタスクは完了する前提。差は完了までのコストに現れる
2. **PTY signals を実際に検証**: Exp 2 で本物の interrupt、corrective instruction が発生
3. **ACM の全パイプラインが動く**: hooks → signal collection → experience generation → retrieval → injection
4. **定量的**: トークン数、ターン数、corrective 数は客観的に測定可能
5. **再現性**: SWE-bench Verified は公開データセット。メトリクス定義も公開

### 残る課題

- **N=3 の統計的検出力**: process metrics の効果量が大きければ記述統計でも示せる
- **学習効果**: 条件の実行順序をランダム化で対策
- **実験パイプラインの SWE-bench 対応**: 現在の runner は自作タスク向け
- **完全 blind は困難**: ACM injection の存在を操作者が意識する

## Issue 計画への影響

| Issue | 現状 | 推奨アクション |
|-------|------|---------------|
| #95 (SWE-Bench-CL) | Open | AC を再設計: SWE-bench Verified + CL メトリクス借用 |
| #96 (Cross-session measurement) | Open | SWE-Bench-CL メトリクスで代替 → クローズ |
| #97 (Procedural drift) | Open | 時期尚早 → 保留 |
| 新規: Exp 2 設計 | — | 同一条件 × 3 プロジェクト手動実験の Issue 作成 |

## #95-D (SWE-bench Evaluator Adapter) の優先度評価

**評価日**: 2026-04-16
**結論**: 現時点では優先度が低い。DEFERRED のまま据え置き。

### 理由

1. **Exp 1 は retrieval-injection のシミュレーションに留まる**: `claude --print` は非対話型のため PTY signals（interrupt, corrective instruction）が発生しない。Docker Evaluator を作っても ACM の全パイプラインは検証できない。

2. **インフラ投資が重い割にリターンが不確実**: Python `swebench` パッケージ + Docker 環境の構築・保守コストに対し、床効果（SWE-bench Verified SOTA でも約 50%）のリスクが残る。

3. **#95-A/B/C で十分な基盤が完成している**: CL メトリクス、process metrics、タスクローダーは Exp 2（手動実験）でもそのまま使える。Evaluator Adapter がなくても論文に必要なデータは取得可能。

4. **Exp 2（手動実験）を優先すべき**: ACM の全パイプラインが動作し、process metrics の差が直接測定でき、論文の RQ に直接答えられる。

### 再検討のトリガー

- Exp 2 の結果で大規模自動実験の必要性が明らかになった場合
- SWE-bench の pass rate が改善するモデル・手法が利用可能になった場合

## 参考文献

- SWE-Bench-CL: Joshi, Chowdhury, Uysal. arXiv:2507.00014, June 2025
- ExpeL: Zhao et al. AAAI 2024
- Voyager: Wang et al. NeurIPS 2023
- MemGPT: Packer et al. NeurIPS 2023 Workshop
- LifelongAgentBench: arXiv:2505.10783, May 2025
- SWE-bench: Jimenez et al. ICLR 2024
- SWE-rebench: arXiv:2505.20411
