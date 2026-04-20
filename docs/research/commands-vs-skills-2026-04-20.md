# Research: `commands/` vs `skills/` in Claude Code plugins

## Research Date
2026-04-20

## Research Purpose

ACM プラグインで slash command を `/acm:report` / `/acm:health` の形で autocomplete dropdown に表示させたい。`skills/` 配置では `/report` `/health` と prefix 無しで表示されてしまう。`commands/` と `skills/` の使い分けのベストプラクティスを明文化する。

## Research Method

- 公式 docs の精読:
  - https://code.claude.com/docs/en/plugins-reference
  - https://code.claude.com/docs/en/skills
- 実機観測（empirical）:
  - CVI プラグイン（`commands/*.md` 配置）: dropdown が `/cvi:lang` 等 prefix 付き
  - ACM プラグイン（`skills/<name>/SKILL.md` 配置）: dropdown が `/report` 等 prefix 無し
- 他プラグインの layout 確認:
  - `code` plugin は `commands/` と `skills/` 両方配置（同名、hybrid pattern）
  - `cvi` plugin は `commands/*.md` 主体、`skills/voice-integration/SKILL.md` は model-invocable background skill

## Summary of Findings

### 公式 docs の建前

> Custom commands have been merged into skills. A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way.
>
> ... commands/ is the legacy format. Use skills/ for new plugins.

機能上は skills の superset という立て付け。

### 実機観測での差異

公式 docs にない **dropdown 表示挙動の差**:

| Layout | Dropdown 表示例 |
|---|---|
| `commands/lang.md` | `/cvi:lang`（prefix 付き） |
| `skills/report/SKILL.md` | `/report`（prefix 無し） |

同一 plugin 内の skill 登録はどちらも `plugin:name` namespace で行われる（system-reminder の skill 一覧や Skill tool 呼び出しでは両方 prefix 付き）が、**slash command palette への登録時に `commands/` 由来は prefix 保持、`skills/` 由来は prefix 省略**される。

### 機能比較

| 機能 | `commands/*.md` | `skills/<name>/SKILL.md` |
|---|---|---|
| slash command 登録 | ✅ | ✅ |
| frontmatter 全種類 | ✅ | ✅ |
| user invocation | ✅ | ✅（`user-invocable: false` で無効化）|
| model (auto) invocation | ✅ | ✅（`disable-model-invocation: true` で無効化）|
| bundled scripts (Python/bash) | ❌（単一 .md のみ）| ✅（`scripts/`, `reference.md` 等）|
| `context: fork` サブエージェント実行 | ✅ | ✅ |
| `` !`command` `` dynamic context injection | ✅ | ✅ |
| 多ファイル segment load | ❌ | ✅ |
| **dropdown 表示** | **`/plugin:name` prefix 付き** | **prefix 無し** |

## 使い分けの判断基準

### `commands/*.md` を選ぶケース

- 単発の slash action（`/commit`, `/deploy`, `/report` のようなボタン感覚）
- 供給ファイル（script, template, reference.md 等）不要
- **dropdown に `/plugin:name` で prefix 込みで見せたい**
- backward compat を気にする

### `skills/<name>/SKILL.md` を選ぶケース

- Python / bash script を同梱する（例: PDF processor, codebase visualizer）
- 長大な reference material を progressive に load したい
- 複数ファイルで構成される複雑な workflow
- model による自動呼び出しが主目的で dropdown 表示は二次的

### `commands/` + `skills/` 両方置くケース（`code` plugin 方式）

- 共存可能（同名でも問題なし、slash 命名空間は共有）
- `commands/` が dropdown 表示を担当、`skills/` が model-invocation + 拡張機能を担当
- **最もリッチ**だが重複管理コストあり
- 判断が難しい場合の「逃げ道」として有用

## 結論（ACM の場合）

`acm:report` と `acm:health` は MCP tool を叩く単純 wrapper。scripts 不要、reference 不要、動的 context 注入不要 → **`commands/*.md` 一択**。

将来 supporting files が必要になったら `skills/` に昇格、もしくは Code plugin 方式で両方併設に移行可能。

## リスクと注意

- `commands/` は公式 docs 上は「legacy format」表記。将来的に廃止される可能性がゼロではない
- ただし現状 Claude Code 本体でサポートは継続しており、実プラグイン（CVI, Code 等公式周辺）で広く使われている
- 廃止アナウンスが出たら `skills/` 側の dropdown 表示が改善されているはずなので、その時点で再移行すればよい

## 参考: 実際の plugin での選択例

| Plugin | `commands/` | `skills/` | 方針 |
|---|---|---|---|
| `cvi` | ✅（9 files）| ✅（1 background skill）| commands 主体、skills は model-invocable background |
| `code` | ✅（10 files）| ✅（10 同名）| hybrid（両方）|
| `ypm` | ✅ | （要確認）| commands 主体 |
| `acm`（本 PR 以前）| ❌ | ✅（2 files）| skills 単体 → dropdown prefix 無し問題 |
| `acm`（本 PR 以後）| ✅（2 files）| ❌ | commands 単体 → dropdown prefix あり |
