# Research: `commands/` vs `skills/` in Claude Code plugins

## Research Date
2026-04-20（修正版）

## Research Purpose

ACM プラグインで slash command を `/acm:report` / `/acm:health` の形（plugin namespace prefix 付き）で autocomplete dropdown に表示させたい。実測では `/report` `/health` と prefix 無しで表示されていた。原因究明と、`commands/` と `skills/` の使い分けのベストプラクティスを明文化する。

## 経緯

- 2026-04-16 `bab32e2`（branch `chore/plugin-cleanup-and-research`, unmerged）: 「skills/ → commands/ に移行」と commit メッセージに記録。当時も本件を調査しており、layout 移行が主要因と推定して作業したが main にはマージされなかった
- 2026-04-20 本リサーチ: 同じ事象を再調査。**真の原因は layout ではなく frontmatter の `name:` フィールド**と判明

## Research Method

- 公式 docs の精読:
  - https://code.claude.com/docs/en/plugins-reference
  - https://code.claude.com/docs/en/skills
- 実機観測（empirical）:
  - CVI プラグイン（`commands/*.md`、`name:` **省略**）: dropdown が `/cvi:lang` 等 prefix 付き ✅
  - ACM プラグイン（`commands/*.md`、`name: report` **明示**）: dropdown が `/report` prefix 無し ❌
  - ACM から `name:` を除去すると `/acm:report` 表示に切り替わった ✅
- 他プラグインの layout 比較:
  - `code` plugin は `commands/` と `skills/` 両方配置（hybrid pattern）
  - `cvi` plugin は `commands/*.md` 主体、`skills/voice-integration/SKILL.md` は model-invocable background skill

## 真の原因（2026-04-20 確定）

**frontmatter に `name:` を明示すると plugin namespace prefix が剥がれる**。

| 設定 | dropdown 表示 |
|---|---|
| `name: report` 明示 | `/report`（prefix 無し）|
| `name:` 省略（filename から auto-derive）| `/acm:report`（prefix 付き）|

公式 docs（Skills > Frontmatter reference）:
> `name` — Display name for the skill. **If omitted, uses the directory name.** Lowercase letters, numbers, and hyphens only (max 64 characters).

→ `name` を明示すると**完全な invocation name**として扱われ、plugin namespace は適用されない。filename（または skills の場合 directory 名）から auto-derive させれば plugin 名が prefix として付与される。

**推奨**: plugin 配下の commands/skills では `name:` を省略する。CVI, code 等の実運用プラグインはこのプラクティスに従っている。

## 補足: 公式 docs 上の `commands/` vs `skills/`

> Custom commands have been merged into skills. A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way.
>
> Commands — Skills as flat Markdown files. Use `skills/` for new plugins

公式は skills を新規推奨、commands は legacy format と位置付ける。ただし機能・display 挙動は等価（`name:` の挙動も同じ）。

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
| dropdown 表示 prefix | `name:` 省略で付く | `name:` 省略で付く |

## 使い分けの判断基準

### `commands/*.md` を選ぶケース

- 単発の slash action（`/commit`, `/deploy`, `/report` のようなボタン感覚）
- 供給ファイル（script, template, reference.md 等）不要
- backward compat を気にする

### `skills/<name>/SKILL.md` を選ぶケース

- Python / bash script を同梱する（例: PDF processor, codebase visualizer）
- 長大な reference material を progressive に load したい
- 複数ファイルで構成される複雑な workflow
- 公式推奨の新規フォーマット

### `commands/` + `skills/` 両方置くケース（`code` plugin 方式）

- 共存可能（同名でも問題なし、slash 命名空間は共有）
- `commands/` が slash invocation、`skills/` が model-invocation + 拡張機能
- **最もリッチ**だが重複管理コストあり

## 結論（ACM の場合）

`acm:report` と `acm:health` は MCP tool を叩く単純 wrapper。scripts 不要、reference 不要、動的 context 注入不要 → **`commands/*.md` + `name:` 省略**が最小解。

- PR #123: `skills/` → `commands/` 移行（layout）
- PR #124: frontmatter から `name:` 除去（真の修正）

## 再発防止 / 作業時の注意

- plugin 配下の `commands/*.md` / `skills/*/SKILL.md` では **`name:` を省略**する。filename / directory 名で auto-derive させる
- `tests/plugin-structure.test.ts` で `name:` 不在を assert することで意図を固定
- 旧 `skills/` cache が残存していると reload しても挙動が混ざる場合がある（今回の事象）。`/utils:clear-plugin-cache <plugin> -y --marketplace <marketplace>` で cache を明示削除し Claude Code を**完全再起動**する

## 参考: 実際の plugin での選択例

| Plugin | `commands/` | `skills/` | `name:` 明示 | dropdown |
|---|---|---|---|---|
| `cvi` | ✅（9 files）| ✅（1 background skill）| ❌ 省略 | `/cvi:*` ✅ |
| `code` | ✅（10 files）| ✅（10 同名）| ❌ 省略 | `/code:*` ✅ |
| `ypm` | ✅ | （要確認）| （要確認）| `/ypm:*` ✅ |
| `acm`（PR #124 以前）| ✅ | ❌ | ✅ 明示 | `/report` ❌ |
| `acm`（PR #124 以後）| ✅ | ❌ | ❌ 省略 | `/acm:*` ✅ |
