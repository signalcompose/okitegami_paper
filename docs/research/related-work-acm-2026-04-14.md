# Research: ACM関連先行研究調査

## 調査日
2026-04-14

## 調査目的
Associative Context Memory (ACM) システムの関連先行研究を調査する。
対象システムの特徴:
- コーディングエージェントセッションの成功/失敗経験を記録
- embedding ベースの検索で関連過去経験を取得
- セッション開始時に取得した経験をエージェントコンテキストに注入
- ユーザートランスクリプトからの修正指示 (corrective instruction) を検出
- セッションをまたいだ繰り返しミスの削減を目指す

## 調査方法
- arXiv 検索 (paper-search-server MCP)
- Google Scholar 検索 (paper-search-server MCP)

---

## Topic 1: LLMエージェントのメモリ・経験学習

### 1-1. Generative Agents: Interactive Simulacra of Human Behavior
- **著者**: Joon Sung Park, Joseph O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang, Michael S. Bernstein
- **年**: 2023 (UIST 2023)
- **URL**: https://dl.acm.org/doi/abs/10.1145/3586183.3606763
- **主要知見**:
  - エージェントが「記憶ストリーム」に経験をログとして蓄積し、関連する記憶を検索・リフレクションして行動決定に利用する三層アーキテクチャを提案
  - 記憶の重要度スコアリング (recency, importance, relevance) による検索
  - 短期・長期記憶を自然言語で格納し embedding で検索するパターンの原型
- **ACMとの関連度**: ★★★★★ (最重要参考文献。ACMの設計思想と直接一致する)

### 1-2. Memory in the Age of AI Agents
- **著者**: Y Hu, S Liu, Y Yue, G Zhang, B Liu, F Zhu, J Lin ほか
- **年**: 2025
- **URL**: https://arxiv.org/abs/2512.13564
- **主要知見**:
  - LLMエージェントの記憶の分類体系: Semantic / Episodic / Procedural の三種
  - セマンティック記憶とエピソード記憶のグラフ構造による表現
  - 記憶が時系列とともに形成・進化・検索される仕組みを網羅的にサーベイ
- **ACMとの関連度**: ★★★★☆ (記憶の分類と検索の設計に参照価値あり)

### 1-3. From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms
- **著者**: J Luo, Y Tian, C Cao, Z Luo, H Lin, K Li, C Kong ほか
- **年**: 2026
- **URL**: https://www.preprints.org/manuscript/202601.0618
- **主要知見**:
  - 記憶メカニズムの進化を「ストレージ段階」→「経験段階」に分類
  - 2024年から2025年にかけて「経験段階」が主流化したと指摘
  - エージェントが意思決定エンティティとして過去軌跡から学ぶフレームワーク
- **ACMとの関連度**: ★★★★☆ (ACMが属する研究トレンドの位置づけに有用)

### 1-4. How Memory Management Impacts LLM Agents: An Empirical Study of Experience-Following Behavior
- **著者**: Z Xiong, Y Lin, W Xie, P He, Z Liu, J Tang ほか
- **年**: 2025
- **URL**: https://arxiv.org/abs/2505.16067
- **主要知見**:
  - 記憶管理がエージェントの「経験追従行動」にどう影響するかを実証研究
  - 記憶の蓄積・検索のパラメータが行動品質に与える影響を定量化
- **ACMとの関連度**: ★★★☆☆ (ACMの実験設計の比較ベースラインとして参考)

### 1-5. ICLR 2026 Workshop on Memory for LLM-Based Agentic Systems (MemAgents)
- **著者**: Z Cai, W Hua, K Li, Y Ma, E Nie, H Schuetze ほか
- **年**: 2026
- **URL**: https://openreview.net/forum?id=U51WxL382H
- **主要知見**:
  - 記憶タイプ間の相互作用 (Semantic / Episodic / Procedural) を議題とするワークショップ
  - 「何を記憶し、いつ使うか」という問いを中心に据えた最前線の研究動向
- **ACMとの関連度**: ★★★☆☆ (最新トレンドの確認に有用)

### 1-6. Synthius-Mem: Brain-Inspired Hallucination-Resistant Persona Memory
- **著者**: Artem Gadzhiev, Andrew Kislov
- **年**: 2026 (arXiv)
- **URL**: https://arxiv.org/abs/2604.11563 (paper_id: 2604.11563v1)
- **主要知見**:
  - 会話を六つの認知ドメイン (biography, experiences, preferences, social, work, psychometrics) に分解して構造化記憶として格納する CategoryRAG アーキテクチャ
  - LoCoMo ベンチマークで 94.37% の精度、adversarial robustness 99.55% を達成
  - 「何が言われたか」ではなく「何が知られているか」を検索するアプローチ
  - 21.79ms のレイテンシで構造化事実を検索
- **ACMとの関連度**: ★★★★☆ (経験を構造化して格納・検索するアーキテクチャの参考に)

---

## Topic 2: RAGによるエージェント自己改善

### 2-1. ExpeL: LLM Agents Are Experiential Learners
- **著者**: Andrew Zhao, Daniel Huang, Quentin Xu, Matthieu Lin, Yong-Jin Liu ほか
- **年**: 2024 (AAAI 2024)
- **URL**: https://ojs.aaai.org/index.php/AAAI/article/view/29936
- **主要知見**:
  - LLMエージェントが自律的に経験を収集し、成功/失敗の軌跡から洞察を抽出して将来のタスクに転用するフレームワーク
  - ファインチューニング不要で、過去経験を自然言語の洞察としてプールに蓄積
  - 洞察を新規タスクのプロンプトにインジェクションすることで性能向上
  - ACMの設計に最も近い先行研究の一つ
- **ACMとの関連度**: ★★★★★ (直接の先行研究。経験プール + インジェクションのパターンが一致)

### 2-2. Self-Improvement of Large Language Models: A Technical Overview and Future Outlook
- **著者**: H Yang, M Xerri, S Park, H Zhang, Y Feng ほか
- **年**: 2026
- **URL**: https://arxiv.org/abs/2603.25681
- **主要知見**:
  - LLMの自己改善手法を包括的にサーベイ
  - ツール利用、コード生成、エージェントベースのフィルタリングを組み合わせた自己改善パイプライン
  - RAGと自己改善の統合アプローチの現状と課題を整理
- **ACMとの関連度**: ★★★☆☆ (ACMの位置づけを自己改善研究の文脈で整理するのに有用)

### 2-3. SWE-Exp: Experience-Driven Software Issue Resolution
- **著者**: S Chen, S Lin, Y Shi, H Lian, X Gu, L Yun ほか
- **年**: 2025
- **URL**: https://arxiv.org/abs/2507.23361
- **主要知見**:
  - ソフトウェアIssue解決のための経験駆動フレームワーク
  - ExpeL を参照しながらソフトウェアエンジニアリング特化の経験学習を実装
  - 手続き的知識をエージェントが経験から自律取得するプロセスを実証
- **ACMとの関連度**: ★★★★☆ (コーディングエージェント文脈での経験学習として直接関連)

### 2-4. Learning on the Job: An Experience-Driven Self-Evolving Agent for Long-Horizon Tasks
- **著者**: C Yang, X Yang, L Wen, D Fu, J Mei, R Wu ほか
- **年**: 2025
- **URL**: https://arxiv.org/abs/2510.08002
- **主要知見**:
  - 長期タスクに対して経験駆動型の自己進化エージェントを提案
  - コンテキスト長制限を尊重しながら経験を検索・再利用するメカニズム
  - Agent Workflow Memory (AWM) と比較しながら連続学習と自己進化の有効性を実証
- **ACMとの関連度**: ★★★★☆ (長期セッション経験の蓄積と再利用のパターンが一致)

---

## Topic 3: 修正フィードバック学習

### 3-1. Automatically Correcting Large Language Models: Surveying the Landscape of Diverse Automated Correction Strategies
- **著者**: L Pan, M Saxon, W Xu, D Nathani, X Wang ほか
- **年**: 2024 (TACL)
- **URL**: https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00660/120911
- **主要知見**:
  - LLM自動修正戦略の包括的サーベイ
  - 外部フィードバックを用いた自動修正が内部フィードバックより有望と結論
  - ユーザー修正・フィードバック活用の研究動向を整理
- **ACMとの関連度**: ★★★☆☆ (corrective instruction 検出の文脈的背景として有用)

### 3-2. Training Language Models to Self-Correct via Reinforcement Learning
- **著者**: Aviral Kumar, Vincent Zhuang, Rishabh Agarwal, Yi Su ほか
- **年**: 2024
- **URL**: https://arxiv.org/abs/2409.12917
- **主要知見**:
  - 外部モデルや人手なしでモデル自身が自己修正訓練データを生成するRL手法 (SCoRe)
  - 自己修正を訓練完了後ではなく訓練中に組み込む
  - ミスから学ぶメカニズムとしての自己修正の定式化
- **ACMとの関連度**: ★★★☆☆ (修正学習の参照として。ACMは重みなし推論時修正を採用している点で異なる)

### 3-3. Reflexion: Language Agents with Verbal Reinforcement Learning
- **著者**: Noah Shinn, Federico Cassano, Ashwin Gopinath ほか
- **年**: 2023 (NeurIPS 2023)
- **URL**: https://proceedings.neurips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html
- **主要知見**:
  - タスクフィードバックを「言語的強化」としてエピソードメモリに蓄積
  - 次回試行時に過去の失敗・反省をコンテキストとして注入することで性能向上
  - コード生成・推論・意思決定タスクでSOTAを達成
- **ACMとの関連度**: ★★★★★ (ACMの設計と同じ「失敗を記憶してコンテキスト注入」パターン。重要な先行研究)

---

## Topic 4: エピソードメモリ

### 4-1. Episodic Memory in AI Agents Poses Risks That Should Be Studied and Mitigated
- **著者**: C DeChant
- **年**: 2025 (IEEE)
- **URL**: https://ieeexplore.ieee.org/abstract/document/10992571/
- **主要知見**:
  - LLMエージェントにおけるエピソードメモリのリスク (プライバシー、誤用) を論じる
  - エピソードメモリが強力であるが故に慎重な設計が必要と指摘
- **ACMとの関連度**: ★★☆☆☆ (設計上の考慮事項として参照価値あり)

### 4-2. Towards Large Language Models with Human-Like Episodic Memory
- **著者**: Christopher V. Dong, Qiuyi Lu, Kenneth A. Norman, Samantha Michelmann
- **年**: 2025 (Trends in Cognitive Sciences)
- **URL**: https://www.cell.com/trends/cognitive-sciences/abstract/S1364-6613(25)00179-2
- **主要知見**:
  - 人間のエピソードメモリとLLMの記憶メカニズムを比較・分析
  - 人間EPM (エピソード記憶) の特性 (文脈依存検索、時系列組織化) をLLMに組み込む方向性を提示
  - 人間EPMへのアライメントがAI進歩に貢献すると論じる
- **ACMとの関連度**: ★★★☆☆ (ACMが生物学的記憶にインスパイアされている点の参照文献として)

### 4-3. ARTEM: Enhancing Large Language Model Agents with Spatial-Temporal Episodic Memory
- **著者**: CHM Tan, B Subagdja, AH Tan
- **年**: 2026 (AAAI 2026)
- **URL**: https://ojs.aaai.org/index.php/AAAI/article/view/39773
- **主要知見**:
  - 空間・時間のエピソード情報をLLMエージェントの記憶として組み込むフレームワーク
  - エピソードメモリベンチマーク (Huet et al., 2025) での評価
- **ACMとの関連度**: ★★★☆☆ (エピソード記憶の構造化と検索の手法として参考)

### 4-4. Echo: A Large Language Model with Temporal Episodic Memory
- **著者**: WT Liu, R Zhang, A Zhou, F Gao, JL Liu
- **年**: 2025
- **URL**: https://arxiv.org/abs/2502.16090
- **主要知見**:
  - 時系列エピソードメモリを LLM に組み込んだシステム Echo を提案
  - エージェントデータ生成フレームワークにより記憶の統合・連結を実現
  - エピソード記憶幻覚を低減する AI アシスタントとして設計
- **ACMとの関連度**: ★★★☆☆ (時系列記憶の扱い方の参考文献として)

---

## Topic 5: 自己改善コーディングエージェント

### 5-1. A Self-Improving Coding Agent
- **著者**: Martin Robeyns, Martin Szummer, Laurence Aitchison
- **年**: 2025
- **URL**: https://arxiv.org/abs/2504.15228
- **主要知見**:
  - LLM呼び出しをオーケストレートするコードを自身が書き、試行錯誤アプローチを自動化
  - AIME 2024 および GPQA Diamond ベンチマークで評価
  - 手作業なしに LLM 推論コードを自己改善するシステム
- **ACMとの関連度**: ★★★★☆ (コーディングエージェントの自己改善として直接関連)

### 5-2. Adaptive Self-Improvement LLM Agentic System for ML Library Development
- **著者**: G Zhang, W Liang, O Hsu, K Olukotun
- **年**: 2025
- **URL**: https://arxiv.org/abs/2502.02534
- **主要知見**:
  - MLライブラリ開発向けの適応的自己改善エージェントシステム
  - コード生成において継続的なフィードバックループによる自己改善を実現
  - 「適応的学習」をエージェントの中核に据えた設計
- **ACMとの関連度**: ★★★☆☆ (コード生成ループにおける自己改善の参考)

### 5-3. Building Self-Evolving Agents via Experience-Driven Lifelong Learning: A Framework and Benchmark
- **著者**: Y Cai, Y Hao, J Zhou, H Yan, Z Lei, R Zhen ほか
- **年**: 2025
- **URL**: https://arxiv.org/abs/2508.19005
- **主要知見**:
  - 経験駆動型の生涯学習エージェントフレームワークとベンチマークを提案
  - エージェントが記憶から正しい情報を検索できるかだけでなく、どのように検索するかも評価
  - ツール習得とマルチステップワークフローへの応用
- **ACMとの関連度**: ★★★★☆ (経験駆動型生涯学習の評価フレームワークとして参考)

### 5-4. Voyager: An Open-Ended Embodied Agent with Large Language Models
- **著者**: Guanzhi Wang, Yuqi Xie, Yunfan Jiang, Ajay Mandlekar, Chaowei Xiao ほか
- **年**: 2023
- **URL**: https://arxiv.org/abs/2305.16291
- **主要知見**:
  - Minecraft でエージェントが経験をスキルライブラリとして蓄積し、類似度で検索・再利用
  - 生涯学習エージェントには自律的スキル習得が必要と論じる
  - 経験の蓄積と検索を組み合わせた lifelong learning の代表的実装
- **ACMとの関連度**: ★★★★☆ (スキルライブラリとしての経験蓄積・検索パターンが ACM と同型)

### 5-5. Experience-Based Knowledge Correction for Robust Planning in Minecraft
- **著者**: S Lee, S Kim, M Oh, Y Yoon, J Ok
- **年**: (OpenReview)
- **URL**: https://openreview.net/forum?id=N22lDHYrXe
- **主要知見**:
  - XENON: 成功/失敗の二値フィードバックのみから計画知識を学習するエージェント
  - 経験に基づく知識修正で強健な計画立案を実現
  - ACMの「corrective instruction = 失敗シグナル」アプローチと類似
- **ACMとの関連度**: ★★★★☆ (二値フィードバックから経験を記録するアーキテクチャが一致)

---

## Topic 6: コンテキスト注入・プロンプトエンジニアリング

### 6-1. A Survey of Context Engineering for Large Language Models
- **著者**: L Mei, J Yao, Y Ge, Y Wang, B Bi, Y Cai, J Liu ほか
- **年**: 2025
- **URL**: https://arxiv.org/abs/2507.13334
- **主要知見**:
  - コンテキストエンジニアリングを「Context Retrieval and Generation」「Agent Communication」「Context Embedding」の三領域に分類
  - プロンプトへのコンテキスト注入手法の包括的サーベイ
  - 検索・生成からエージェントコミュニケーションまでの統合フレームワーク
- **ACMとの関連度**: ★★★★☆ (ACMのコンテキスト注入メカニズムの学術的位置づけに有用)

### 6-2. Large Language Model Agents: A Comprehensive Survey on Architectures, Capabilities, and Applications
- **著者**: Y Lei, J Xu, CX Liang, Z Bi, X Li, D Zhang, J Song, Z Yu
- **年**: 2025
- **URL**: https://www.preprints.org/manuscript/202512.2119
- **主要知見**:
  - LLMエージェントアーキテクチャの包括的サーベイ (2020–2024)
  - 経験から学習し、クエリ embedding に基づいて推論時に記憶を検索するパターンを記述
  - コンテキストを通じた経験注入が実際の推論改善に繋がると結論
- **ACMとの関連度**: ★★★☆☆ (ACMの設計を一般的なエージェントアーキテクチャに位置づける参考文献)

### 6-3. Rethinking Memory Mechanisms of Foundation Agents in the Second Half: A Survey
- **著者**: UC Agent (OpenReview)
- **URL**: https://openreview.net/pdf?id=aLLPYCmSZb
- **主要知見**:
  - 基盤モデルエージェントの記憶メカニズムを「後半期」として再考
  - embedding メカニズムを同じ手法で扱い、エージェントが類似性で中間状態を検索・取得するアーキテクチャ
  - 2025年に急加速する研究動向を整理
- **ACMとの関連度**: ★★★☆☆ (記憶の embedding 検索アーキテクチャの設計参考)

### 6-4. ExpeTrans: LLMs Are Experiential Transfer Learners
- **著者**: J Gao, X Ding, L Zou, B Cai, B Qin ほか
- **年**: 2025 (ACL 2025)
- **URL**: https://aclanthology.org/2025.acl-long.520/
- **主要知見**:
  - LLMが経験的転移学習者として機能するというフレームワーク
  - タスク間での経験転移を実現するプロンプト設計
  - Minecraft での料理プロセス学習など具体的ドメインで検証
- **ACMとの関連度**: ★★★☆☆ (セッション間での経験転移という点でACMと同じ問題意識)

---

## 重要度順の統合サマリー

### 最重要先行研究 (ACMと設計が直接対応)

| タイトル | 年 | ACMとの対応 |
|---------|------|------------|
| Generative Agents (Park et al.) | 2023 | 記憶ストリーム + embedding 検索 + リフレクション |
| ExpeL (Zhao et al.) | 2024 | 経験プール + 洞察抽出 + コンテキスト注入 |
| Reflexion (Shinn et al.) | 2023 | 失敗記憶 + 次セッション注入 |
| Voyager (Wang et al.) | 2023 | スキルライブラリとしての経験蓄積・embedding 検索 |

### 重要先行研究 (設計の一部と対応)

| タイトル | 年 | ACMとの対応 |
|---------|------|------------|
| SWE-Exp (Chen et al.) | 2025 | コーディング文脈での経験学習 |
| A Self-Improving Coding Agent (Robeyns et al.) | 2025 | コーディングエージェントの自己改善 |
| XENON (Lee et al.) | - | 二値フィードバックから経験記録 |
| Learning on the Job (Yang et al.) | 2025 | 経験駆動型自己進化 |
| Synthius-Mem (Gadzhiev et al.) | 2026 | 構造化記憶 + CategoryRAG |

### サーベイ論文 (位置づけ把握に有用)

| タイトル | 年 | 用途 |
|---------|------|------|
| Memory in the Age of AI Agents (Hu et al.) | 2025 | 記憶の分類体系 |
| Self-Improvement of LLMs (Yang et al.) | 2026 | 自己改善手法のサーベイ |
| Context Engineering Survey (Mei et al.) | 2025 | コンテキスト注入の分類 |
| Survey of Self-Evolving Agents (Gao et al.) | 2025 | 自己進化エージェントの整理 |

---

## 結論

ACMシステムは以下の研究ストリームを統合している:
1. **記憶ストリーム + embedding 検索** (Generative Agents の系譜)
2. **経験抽出 + 推論時コンテキスト注入** (ExpeL / Reflexion の系譜)
3. **コーディングエージェントの継続的改善** (SWE-Exp / Self-Improving Coding Agent の系譜)
4. **ユーザー修正シグナルからの学習** (Reflexion の「フィードバックを言語記憶に変換」の拡張)

ACMの独自性は:
- **自動的なトランスクリプト解析** による corrective instruction の検出 (LLMによる分類)
- **セッション完全性** 単位での経験記録 (成功/失敗を session 粒度で記録)
- **MCP サーバー統合** によるツールとしての提供

既存研究の多くは手動フィードバックか固定タスク環境が前提であり、自然な会話トランスクリプトから修正指示を自動検出してセッション経験として蓄積するACMのアプローチは差別化ポイントになりうる。
