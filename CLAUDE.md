# okitegami_paper — CLAUDE.md

## プロジェクト概要

Associative Context Memory (ACM) の研究論文リポジトリ兼実装リポジトリ。
論文・仕様書・実装・実験がすべて同一リポジトリに集約されている。

- 論文: `docs/acm-preprint-draft.md`（英語）/ `docs/acm-preprint-draft-ja.md`（日本語）
- 仕様書: `docs/SPECIFICATION.md`（実装のSingle Source of Truth）
- ロードマップ: `docs/ROADMAP.md`
- 実装: `src/`（ACM MCPサーバー）
- 実験: `experiments/`（タスク定義・実験手順・結果）
- セッションログ: `docs/session-log.md`（Stop hookで自動更新）

## 開発原則

1. **DDD（Document-Driven Development）**: 実装前に必ず仕様書を確認・更新する。`docs/SPECIFICATION.md` がSingle Source of Truth。
2. **TDD**: Red → Green → Refactor。テストを先に書く。
3. **DRY**: 重複を避ける。ただし過度な抽象化より可読性を優先。
4. **GitFlow**: `main` / `develop` / `feature/*` / `release/*` / `hotfix/*`
5. **Conventional Commits**: `feat:`, `fix:`, `docs:`, `test:`, `chore:` 等

## ワークフロー

- 実装は `/code:dev-cycle` スキルを使用する
- フェーズごとに `docs/ROADMAP.md` のフェーズを参照してIssueを切る
- PRはレビュー後、やまとさんの「マージして」指示を待ってマージ

## 実装方針

- **目的は効果測定**。論文 Section 5 の実験設計を満たす最小限の実装を作る
- 過剰な機能を作り込まない
- `docs/SPECIFICATION.md` に書かれていない機能は実装しない

## Marketplace 配布方針

本リポジトリ自体を `signalcompose/okitegami_paper` として Marketplace に公開する。
論文・実装・実験が同一リポジトリに集約されており、インストールするだけで実験を再現できる。

プラグイン構造として `.claude-plugin/plugin.json` を整備すること。
参考: `signalcompose/claude-tools` の既存プラグイン構造（`plugins/code/` 等）

## セッション開始時の必須確認

1. `docs/session-log.md` の末尾を確認し、前回の作業状況を把握する
2. `docs/SPECIFICATION.md` と `docs/ROADMAP.md` を確認する
3. `git branch` で現在のブランチを確認する
