# Research: ACM Future Directions — Related Work & Next Steps

## Research Date
2026-04-14 (revised)

## Research Purpose
ACM (Associative Context Memory) の今後の取り組み方向を定めるため、関連する学術論文・産業動向・オープンソースプロジェクトを調査し、ACM の位置づけと差別化ポイントを明確にする。

## Research Method
- arXiv / Google Scholar による学術論文検索 (25+ papers)
- Web 検索による産業動向・OSS プロジェクト調査 (20+ sources)
- Claude Code リリースノート精査 (v0.2.21 〜 v2.1.105)

---

## 1. ACM の学術的位置づけ

### 1.1 最も近い先行研究

| 論文 | 年 | 関連度 | ACM との対比 |
|------|-----|--------|-------------|
| **ExpeL** (Zhao et al., AAAI 2024) | 2024 | 高 | 成功/失敗軌跡から洞察を抽出しプロンプト注入。ACM と同じパラダイムだが、coding agent 特化ではない |
| **Reflexion** (Shinn et al., NeurIPS 2023) | 2023 | 高 | 言語的強化をエピソードメモリに蓄積し次試行に注入。ACM の「失敗記憶→注入」の先駆 |
| **SWE-Exp** (Chen et al., 2025) | 2025 | 高 | ソフトウェア Issue 解決に特化した経験駆動フレームワーク。coding agent 文脈で最も近い |
| **AgentHER** (2026) | 2026 | 中 | 失敗軌跡を別ゴールの成功例として再ラベル。+7-12pp 改善。fine-tuning ベース |
| **Voyager** (Wang et al., 2023) | 2023 | 中 | スキルライブラリを embedding 検索。lifelong learning の原型 |
| **Generative Agents** (Park et al., UIST 2023) | 2023 | 中 | recency/importance/relevance スコアリングの原型 |

### 1.2 ExpeL との関係 — 正確な位置づけ

**「経験蓄積 → embedding 検索 → 新タスクに注入」の基本パイプラインは ExpeL (AAAI 2024) が先行して確立**。ACM はこのパラダイムをそのまま引き継いでおり、この部分での novelty 主張は困難。

ExpeL が ACM より先行・優位な点:
- 複数軌跡からの一般化 insight 抽出（LLM による reflection）
- 標準ベンチマーク (HotpotQA, ALFWorld, WebShop) での改善実証

### 1.3 ACM の新規性 — ExpeL と異なる軸

ACM が新規性を主張できるのは、ExpeL とは異なる以下の軸:

1. **ラベルなし環境でのシグナル取得**: ExpeL はタスクの成功/失敗が既知（明示的ゴール判定）。実世界の coding session にはこのラベルがない。ACM は transcript の自動解析により corrective instruction（ユーザーの修正指示）を検出し、これを failure シグナルとして利用。明示的ラベルなしでの経験生成は ExpeL にない機能
2. **deployed coding agent への MCP 統合**: ExpeL は固定タスクセットでの研究フレームワーク。ACM は MCP サーバーとして実稼働中の coding agent に組み込む設計。このエンジニアリング側面は ExpeL が扱わない領域
3. **セッション粒度の多シグナル集約**: ExpeL は個別タスク軌跡を記録。ACM はセッション全体を interrupt, tool_success, corrective, stop 等の複数シグナルで総合評価し、signal_strength を算出
4. **inference-time context injection**: ExpeL と共通だが、fine-tuning 不要で closed-model API に適用可能な点を ACM の実用性として主張可能

**論文での positioning**: 「ExpeL のパラダイムを coding agent のデプロイメントに適用し、ラベルなし環境での自動シグナル取得 (corrective instruction detection) を追加した」と位置づけるのが正確

---

## 2. 産業動向

### 2.1 商用 Coding Assistant の記憶機能

| ツール | 記憶方式 | 学習機能 | ACM との差 |
|--------|---------|---------|-----------|
| **Claude Code** Auto Memory/Dream | markdown ファイル蓄積 + 夜間整理 | preference/instruction レベル | タスク経験の embedding 検索なし |
| **Cursor** Memories | セッションレベル | なし (cross-session) | 経験蓄積・検索なし |
| **GitHub Copilot** Agent Mode | なし (stateless) | セッション内 auto-correct のみ | cross-session 学習なし |
| **AGENTS.md** convention | markdown ファイル | なし | 手動管理、検索なし |

**重要な発見**: 主要 coding assistant のいずれも cross-session での経験再利用 (experience replay) を実装していない。これは ACM が占めるギャップ。

### 2.2 開発者信頼度の低下

AI coding tool への開発者信頼度が 2023-24 年の 70%+ から 2025 年に ~60% に低下。原因の一つとして「同じミスを繰り返す」ことが指摘されている。ACM はこの問題に直接対応する。

---

## 3. メモリシステムの技術動向

### 3.1 主要 OSS プロジェクト

| プロジェクト | 特徴 | ACM との差 |
|-------------|------|-----------|
| **Mem0** (2025) | atomic fact 抽出 + vector DB。26% 相対改善、90% token 削減 | 事実/preference メモリ。タスク経験ではない |
| **A-Mem** (NeurIPS 2025) | 動的連想メモリ (Zettelkasten 方式)。85-93% token 削減 | 汎用エージェント向け。coding 特化ではない |
| **Synthius-Mem** (2026) | 6 認知ドメイン分解。94% 精度 | persona メモリ。経験学習ではない |

### 3.2 検索・スコアリングの進歩

**現状**: ACM は cosine similarity のみで検索。Mem0/A-Mem は semantic similarity + recency + importance の混合スコアリングを採用。

**評価**: 現段階では cosine similarity のみで問題ない。根拠:
- ACM の experience store は数十〜数百エントリ規模。Mem0/A-Mem が扱う数千〜数万エントリとはスケールが異なる
- この規模では retrieval quality の劣化は起きにくい
- ただし **recency decay は早期に追加する価値がある**: 古い経験が retrieval を支配すると procedural drift のリスクがある
- 実装は `last_retrieved_at` カラム追加 + cosine score に時間減衰を掛けるだけ（LLM 不要）

**将来的な追加候補** (experience count が数百を超えた場合):
- `retrieval_count` による usage-based reinforcement
- `signal_strength` を検索スコアに反映

**Context rot**: 50k+ token で long-context アプローチは劣化。外部メモリ + 検索の方がコスト効率が高い (GAM paper)

---

## 4. 既知のリスクと失敗モード

### 4.1 メモリ攻撃

| 攻撃手法 | 論文 | リスク | ACM への影響 |
|---------|------|--------|-------------|
| **MemoryGraft** (2025) | arxiv:2512.16962 | 偽経験の永続注入。>95% 成功率 | ACM は自セッションからのみ記録するため直接リスクは低い |
| **MINJA** (NeurIPS 2025) | arxiv:2604.02623 | クエリのみでメモリ汚染 | embedding 検索の操作リスク |

### 4.2 内在リスク — メモリの成長とノイズ管理

#### 問題

経験エントリが蓄積されるにつれ、以下のリスクが増大する:
1. **Procedural drift** — 初期の次善策が経験として固定化され、再利用が次善策を増幅
2. **Noise accumulation** — 低品質・古い経験が retrieval を汚染
3. **Semantic drift** — 繰り返しの要約・統合で経験の意味が変質
4. **Retrieval bias** — 少数の高類似度エントリが検索を支配
5. **False positive corrective detection** — 偽陽性の修正指示検出が誤った「教訓」を生成 (PR #85 で一部対処済み)

#### メモリ管理 — 先行研究の整理

| 手法 | 採用例 | LLM 要否 | 概要 |
|------|--------|---------|------|
| **Recency decay** | Generative Agents | 不要 | 最終アクセス時刻からの指数減衰 |
| **Usage-based reinforcement** | PER (RL) | 不要 | 取得回数でスコア強化、未使用は減衰 |
| **Quality gate at write** | Voyager | 不要 | 品質閾値以下のエントリを拒否 |
| **Capacity cap + eviction** | PER (RL) | 不要 | 上限を設け最低スコアを evict |
| **Cluster-and-merge** | 一般的 | 不要 (embedding) | 類似エントリをクラスタリング、代表のみ残す |
| **Importance scoring** | Generative Agents | 要 | 書き込み時に LLM で重要度を採点 |
| **LLM-based extraction/update** | Mem0 | 要 | 新旧 fact を比較し ADD/UPDATE/DELETE を LLM が判断 |
| **Reflective consolidation** | Generative Agents, ExpeL | 要 | 関連エントリ群から一般化 insight を LLM が生成 |

#### ACM への推奨アプローチ — Infrastructure + LLM Reflection の同時導入

**Infrastructure 層** (前提条件):
- `last_retrieved_at` + `retrieval_count` カラムを experiences テーブルに追加
- 検索スコア = `cosine_similarity × recency_decay(last_retrieved_at) × log(retrieval_count + 1)`
- 容量上限 (例: 500 件) を設定、下限スコアのエントリを定期 evict
- ACM は既に `signal_strength` と `promotion_threshold` による quality gate を持つ — これを維持

**LLM Reflection 層** (Ollama 活用):
- embedding クラスタリング (k-means/DBSCAN) で類似エントリをグループ化
- 各クラスタの N エントリから Ollama で一般化 insight を生成（Generative Agents / ExpeL の reflection パターン）
- 最高スコアの代表エントリ + 生成 insight を保持、元エントリは archive (soft delete)
- トリガー: experience count が上限の 80% に達した時、または定期バッチ（例: 週次）

**根拠**: Ollama は既に corrective detection で利用しており、追加のインフラコストなし。Infrastructure 層のみ（heuristic GC）vs Infrastructure + Reflection（LLM GC）のアブレーション比較が論文データとして有効。

**ポイントシステム (Injection-Outcome Feedback Loop)**:
- 注入後に corrective が発生しなかった → +1（経験が効いた）
- 注入後に同種の corrective が発生した → -1（経験が効かなかった）
- スコアが閾値以下に落ちたエントリは eviction 候補
- これは効果測定 (Section 5) と統合可能 — injection-outcome correlation の測定軸を直接活用

### 4.3 ベンチマークの選定

**重要な発見**: cross-session 改善を測定するベンチマークが 2025 年に登場している。

| ベンチマーク | 測定対象 | Cross-session | ACM 適合度 |
|-------------|---------|---------------|-----------|
| **SWE-Bench-CL** (Columbia, 2025) | chronological GitHub issue 列での forward transfer, forgetting | Yes (設計目標) | **高** |
| **SWE-EVO** (Dec 2025) | 長期 SW 進化 (48 tasks, avg 21 files) | 適応可能 | 中-高 |
| **SWE-Exp protocol** | experience injection の有無での Pass@1 比較 | Yes | **高** |
| **MemoryArena** (Stanford) | 多セッション間の記憶利用 | Yes | 中 |
| **MemoryCode** (ACL 2025) | 多セッション coding 指示の追跡 | Yes | 中 |
| **LiveCodeBench** | 時系列コーディング問題 | 適応可能 | 低-中 |
| **SWE-bench Verified** | 単発 issue 解決 | No | 低 (baseline のみ) |

**推奨ベンチマーク戦略**:

1. **主要評価基盤: SWE-Bench-CL** — ACM の use case に直接対応。FAISS memory module を ACM に置き換えて forward transfer と forgetting を測定。chronological ordering が ACM のセッション蓄積と自然に整合
2. **比較基準: SWE-Exp protocol** — SWE-bench Verified 上で experience injection あり/なしを比較。コード公開済み (github.com/YerbaPage/SWE-Exp) で直接比較可能
3. **長期進化: SWE-EVO** — 同一リポジトリの時系列 release をまたぐタスクで Fix Rate 改善を測定
4. **日常の自然実験** (Section 5 参照) — ベンチマーク + 自然実験データの二本立てで ecological validity を確保

**ベンチマーク取得・記録基盤の実装**:

ベンチマーク実行結果を体系的に記録・比較できる仕組みを整備する:

```
experiments/benchmarks/
├── config/           # ベンチマーク設定 (SWE-Bench-CL, SWE-Exp 等)
├── results/          # 実行結果 (JSON/CSV、git tracked)
│   ├── swe-bench-cl/ # forward_transfer, forgetting メトリクス
│   └── swe-exp/      # pass@1 比較データ
└── scripts/          # 実行・集計スクリプト
```

記録すべきメトリクス:
- **条件**: baseline (no memory) / ACM / Mem0 (比較)
- **メトリクス**: pass@1, forward_transfer, forgetting, corrective_rate
- **メタデータ**: ACM config (GC 設定、容量上限等)、experience count、model version
- **再現性**: 実行コマンド、seed、environment を記録

これにより GC パラメータ変更やアルゴリズム改善の効果を定量的に比較可能。

---

## 5. 効果測定と PDCA [最優先]

### 5.1 なぜ効果測定が最優先か

ACM の実装は Phase 6-A まで完了しているが、「ACM が実際に agent の行動を改善するか」を示すデータがない。効果測定なしには:
- 論文の Section 5 が埋まらない
- 品質改善の PDCA が回せない
- retrieval/GC の改善が「効いたかどうか」も判断できない

### 5.2 二本立てアプローチ

#### A. 自然実験 (Natural Experiment) — 日常利用からの効果検証

**方針**: 専用実験インフラではなく、日常の ACM 利用データから効果を読み取る。

**4つの測定軸**:

1. **パターン再発率 (Recurrence Rate)**: 特定の失敗パターン (retrieval_keys) が failure experience として記録された後、同一パターンが再発する頻度。ACM が効いていれば時間とともに低下。
   ```
   recurrence_rate = 同一パターン再発回数 / 初回記録後のセッション数
   ```

2. **時系列トレンド (Temporal Trend)**: 同一プロジェクト内で corrective_rate (= corrective_count / tool_success_count) が経験蓄積に伴い低下するか。自然な用量-反応関係。

3. **注入-結果相関 (Injection-Outcome Correlation)**: injection episode ごとに、注入した failure パターンと同じ種類の corrective がそのセッションで発生したか。
   ```
   injection_miss_rate = 一致する corrective 数 / 注入パターン数
   0% = 注入した警告が全て効いた
   ```

4. **Cross-project Transfer**: Project A の経験が Project B に注入された際の corrective_rate 変化。

**実装**: 既存 `acm_report` の拡張（新しい SQL クエリ追加）。新しい実験インフラは不要。

**可視化との統合**: 効果測定の結果を SessionStart の systemMessage に表示。
```
[ACM] 3 experiences injected | corrective rate -23% over last 5 sessions
```

#### B. ベンチマーク評価 — 定量的な比較データ

自然実験データを補完する目的で、SWE-Bench-CL を主要ベンチマークとして使用。

**SWE-Bench-CL の利点**: forward transfer と forgetting のメトリクスが ACM の session-level 経験蓄積と直接対応する。ACM を memory module として接続し、メモリなし (baseline) / ACM あり / Mem0 (比較) で 3 条件の比較が可能。

**Phase 6-A の experiment runner**: SWE-Bench-CL の実行インフラとして再利用可能。完全な新構築は不要。

#### C. 日常 PDCA サイクル

効果測定を一度きりの論文データではなく、継続的な改善ループとして運用:

```
Plan:  acm_report で現状の corrective_rate, recurrence_rate を確認
Do:    retrieval/GC/detection の改善を実装
Check: 改善後の数値を acm_report で比較
Act:   数値が改善 → 次の改善項目へ / 悪化 → ロールバック
```

**学術的位置づけ**: "Ecological validity through in-situ measurement" — synthetic benchmark ではなく実使用データからの効果測定。実際のユーザー行動変化を測定する点で新規性を主張可能。

---

## 6. アーキテクチャ — Claude Code 機能の活用と LLM-agnostic 設計

### 6.1 設計原則: Claude Code 一本化 (現段階)

**方針**: 現段階では Claude Code 専用で開発を進める。LLM-agnostic 化は将来の課題として記録のみ。

**根拠**:
- ACM の差別化要因（transcript-based corrective detection）は Claude Code の transcript JSONL に依存
- 他の agent (Cursor, Windsurf, Cline) は transcript equivalent を公開しておらず、hook system もない
- agent の自己申告に頼る corrective detection は品質が大幅に劣る
- MCP 自体は業界標準化しつつあり、ACM の MCP ツール層は既にポータブル
- **将来的な Lite Mode** (rules file で agent に MCP 呼び出しを指示する方式) は設計として記録するが、実装は後回し

**将来の LLM-agnostic 化に向けた設計上の注意**:
- MCP server 層は hook に依存しない設計を維持する
- hook 固有のロジックは `src/hooks/` に隔離し、MCP server コアに混入させない
- これにより将来の Lite Mode 追加時に MCP server 変更が不要になる

### 6.3 Auto Memory との棲み分け

Claude Code の Auto Memory は:
- markdown ファイルベース (`~/.claude/projects/<project>/memory/`)
- preference/instruction レベルの記憶
- Auto Dream による夜間整理 (v2.1.59+)

ACM は:
- SQLite + embedding ベース
- タスク経験レベルの記憶（成功/失敗の構造化データ）

**結論**: 両者は補完的だが、**ACM は Auto Memory に依存しない設計を維持すべき**。Auto Memory は Claude 固有機能であり、LLM-agnostic 原則に反する。ACM は独自の SQLite store で完結する。

### 6.4 SessionEnd vs Stop — 長セッションの問題

**現状**: session-end hook は `Stop` イベントに登録（毎ターン発火 → idempotency guard 必要）。

**SessionEnd hook (v1.0.85)**: セッション終了時に 1 回だけ発火。

**長セッションでの懸念**: セッションが長く compact が複数回走ると、SessionEnd 発火時に transcript の初期部分が失われている可能性がある。つまり transcript-based corrective detection が不完全になる。

**解決策: SessionEnd + PreCompact のペア運用**:
```
PreCompact:  compact 前に現在の transcript を解析し corrective signals を保全
             exit code 2 で保存完了まで compact をブロック可能 (v2.1.105)
SessionEnd:  最終的な experience generation（signals は PreCompact で既に保全済み）
```

これにより:
- Stop の idempotency guard が不要になる
- 長セッションでも corrective signals が失われない
- compact 前後の一貫性が保たれる

### 6.5 UserPromptSubmit によるリアルタイム corrective detection [改善推奨]

**現状**: corrective detection は session-end 時に transcript JSONL を一括解析。

**改善**: `UserPromptSubmit` hook (v1.0.54) を使えば、メッセージ送信のたびにリアルタイムで corrective detection が可能。

メリット:
- transcript 解析の冗長性を排除（PreCompact での保全と合わせて二重保険）
- リアルタイムフィードバック（systemMessage で即時表示可能）
- `additionalContext` (v1.0.59) でモデルのコンテキストに分類結果を追加

デメリット:
- 毎メッセージで Ollama 呼び出し → レイテンシ影響
- 前後のコンテキスト（前のアシスタント応答）が限定的
- Ollama 不可時のフォールバックが structural detection のみ

**推奨**: Ollama 利用可能時のみ有効化。不可時はスキップ（session-end での一括解析にフォールバック）。

### 6.6 Plugin System の最新化 [改善推奨]

ACM は既に `.claude-plugin/plugin.json` を持つが、以下の新機能に対応すべき:

| 機能 | 版 | ACM での活用 | 優先度 |
|------|-----|-------------|-------|
| Plugin hooks | v2.0.43 | session-end, PreCompact 等の hook 自動登録 | **高** |
| Plugin skills | v2.0.20 | `/acm:report`, `/acm:health` 等のスキル定義 | 高 |
| Plugin userConfig | v2.1.83 | ollama_url, model, verbosity 等の設定 UI | 中 |
| `${CLAUDE_PLUGIN_DATA}` | v2.1.78 | プラグイン更新でも永続するデータディレクトリ | 中 |
| Plugin monitors | v2.1.105 | バックグラウンドシグナル監視 | 低 (長期) |
| Plugin agents | v1.0.60 | ACM 分析専用サブエージェント | 低 |
| Plugin bin/ | v2.1.91 | ACM CLI ツールの同梱 | 低 |

**特に plugin hooks への移行**: 現在は手動で `.claude/hooks/` にスクリプトを配置しているが、plugin.json で hook を宣言的に登録できる。インストール時に自動設定されるため、ユーザー体験が改善する。

### 6.7 ACM 可視化・ログ戦略

#### ユーザー向け表示 (Indication)

ACM が動作していることをユーザーに示す手段:

| 手段 | タイミング | 表示内容 |
|------|-----------|---------|
| SessionStart `systemMessage` | セッション開始 | injection 件数・ソース・効果トレンド |
| Stop hook `systemMessage` | ターン終了 | corrective 検出時のみ通知 |
| UserPromptSubmit | メッセージ送信時 | リアルタイム corrective 分類結果 |

#### ローカル LLM 評価の表示

Ollama による corrective 分類結果をユーザーに表示する。表示例:

```
[ACM] Corrective detected (LLM, confidence: 0.85): "テスト前にちゃんと確認して"
[ACM] Ollama classification: 3 messages analyzed, 1 corrective found
```

#### 表示詳細度の設定制御

`acm_config` に `verbosity` 設定を追加:

| レベル | 表示内容 |
|--------|---------|
| `quiet` | injection 件数のみ |
| `normal` | + corrective 検出サマリー + LLM 評価結果 |
| `verbose` | + 個別分類結果 + retrieval スコア + 検索候補 |

#### ログ永続化

3層構成:

```
層1: console.error    → リアルタイム診断（既存）
層2: SQLite acm_logs  → 構造化クエリ・レポート用
層3: JSONL ファイル   → 運用ログ・デバッグ用
```

**重要**: JSONL ログはユーザー向けの運用診断ツール。Claude に対しては ACM の MCP ツール (`acm_retrieve`, `acm_report`) が正規のインターフェース。Plugin 設定や CLAUDE.md でこの境界を明示し、Claude がログファイルを直接読みに行くことを防ぐ。

---

## 7. 推奨実装ロードマップ

### 短期 (次の 1-2 sprint) — 効果測定 + 可視化 + GC

```
1. [5.2.A] 自然実験の測定基盤      ← acm_report 拡張、4 測定軸の SQL
2. [6.7]   verbosity 設定 +        ← ユーザーへの ACM 動作表示
           systemMessage 可視化
3. [6.7]   JSONL ログ永続化         ← 運用診断基盤
4. [6.4]   SessionEnd + PreCompact  ← Stop からの移行、長セッション対応
           hook ペア運用
           ※ PreCompact の品質（transcript 解析精度）に注意
5. [4.2]   メモリ GC                ← Infrastructure + LLM Reflection を同時導入
           (recency/usage tracking + Ollama reflection)
```

### 中期 — ベンチマーク + Plugin 最新化

```
6. [4.3]   ベンチマーク記録基盤     ← 取得・記録の仕組み整備
7. [5.2.B] SWE-Bench-CL 評価       ← ベンチマーク定量データ
8. [6.5]   UserPromptSubmit         ← リアルタイム corrective detection
           リアルタイム検出
9. [6.6]   plugin hooks/skills      ← plugin system 最新化
           への移行
```

### 長期 — スケーラビリティ + 拡張

```
10. [5.2.D] Cross-session 測定FW   ← 論文新規性強化
11.         Procedural drift 検出   ← 長期安定性
12.         Lite Mode テンプレート  ← Cursor/Cline/Windsurf 対応 (将来)
13.         RLHF 接続              ← 研究拡張
```

---

## 8. 主要参考文献

### 学術論文

- Zhao et al. "ExpeL: LLM Agents Are Experiential Learners" (AAAI 2024)
- Shinn et al. "Reflexion: Language Agents with Verbal Reinforcement Learning" (NeurIPS 2023)
- Chen et al. "SWE-Exp: Experience-driven Software Issue Resolution" (arXiv:2507.23361, 2025)
- Park et al. "Generative Agents: Interactive Simulacra of Human Behavior" (UIST 2023)
- Wang et al. "Voyager: An Open-Ended Embodied Agent with Large Language Models" (2023)
- Hu et al. "Memory in the Age of AI Agents" (arXiv:2512.13564, 2025)
- Luo et al. "From Storage to Experience" (2026)
- Gadzhiev et al. "Synthius-Mem" (arXiv:2604.11563, 2026)
- Yang et al. "Learning on the Job" (arXiv:2510.08002, 2025)
- Yang et al. "Self-Improvement of LLMs: A Technical Overview" (arXiv:2603.25681, 2026)
- Pan et al. "Automatically Correcting Large Language Models" (TACL 2024)
- Kumar et al. "Training LMs to Self-Correct via RL" (arXiv:2409.12917, 2024)
- Tan et al. "ARTEM: Enhancing LLM Agents with Spatial-Temporal Episodic Memory" (AAAI 2026)
- Dong et al. "Towards LLMs with Human-Like Episodic Memory" (Trends in Cognitive Sciences, 2025)
- Robeyns et al. "A Self-Improving Coding Agent" (arXiv:2504.15228, 2025)
- Cai et al. "Building Self-Evolving Agents via Experience-Driven Lifelong Learning" (arXiv:2508.19005, 2025)
- Mei et al. "A Survey of Context Engineering for LLMs" (arXiv:2507.13334, 2025)
- Gao et al. "ExpeTrans: LLMs Are Experiential Transfer Learners" (ACL 2025)
- AgentHER (arXiv:2603.21357, 2026)
- AgentRR (arXiv:2505.17716, 2025)
- RISE (NeurIPS 2024)
- Live-SWE-agent (arXiv:2511.13646, 2025)
- SWE-EVO (arXiv:2512.18470, 2025)

### ベンチマーク

- SWE-Bench-CL (arXiv:2507.00014, Columbia 2025) — cross-session continual learning
- SWE-bench Verified — single-task completion baseline
- SWE-EVO (arXiv:2512.18470, 2025) — long-horizon evolution
- MemoryArena (arXiv:2602.16313, Stanford) — multi-session agent memory
- MemoryCode (arXiv:2502.13791, ACL 2025) — multi-session coding
- LiveCodeBench (arXiv:2403.07974) — temporal coding evaluation

### メモリ攻撃・安全性

- MemoryGraft (arXiv:2512.16962, 2025)
- MINJA (arXiv:2604.02623, NeurIPS 2025)
- SSGM Framework (arXiv:2603.11768, 2026)
- MemGuard (2026)

### メモリ管理

- Schaul et al. "Prioritized Experience Replay" (ICLR 2016)
- MemBench (arXiv:2506.21605, ACL Findings 2025)
- BEAM (ICLR 2026)
- Mem2ActBench (arXiv:2601.19935)

### OSS / 産業

- Mem0: https://github.com/mem0ai/mem0
- A-Mem: https://github.com/WujiangXu/A-mem (NeurIPS 2025)
- Agent Memory Paper List: https://github.com/Shichun-Liu/Agent-Memory-Paper-List
- SWE-Bench-CL: https://github.com/CL-bench/SWE-bench-CL
- SWE-Exp: https://github.com/YerbaPage/SWE-Exp
- Claude Code Auto Memory/Dream: https://code.claude.com/docs/en/memory
- SWE-bench Verified: https://www.swebench.com/

---

## 結論

ACM の基本パイプライン（経験蓄積 → 検索 → 注入）は ExpeL (AAAI 2024) が先行して確立したパラダイム。ACM の新規性は「ラベルなし環境での corrective instruction 自動検出」と「MCP 経由の deployed coding agent 統合」にある。この位置づけを論文で正確に記述する必要がある。

最優先は**効果測定の基盤構築**。自然実験 (4 測定軸) + ベンチマーク (SWE-Bench-CL) の二本立てで、日常的な PDCA と論文データの両方を賄う。効果測定なしには品質改善もできない。

メモリの成長管理は Infrastructure（recency/usage tracking + capacity cap）と LLM Reflection（Ollama クラスタリング + insight 生成）を同時導入。Ollama は既に利用可能であり、段階的導入の理由がない。

アーキテクチャは現段階では Claude Code 一本化。MCP server 層は hook に依存しない設計を維持し、将来の他 agent 対応に備える。
