#!/usr/bin/env python3
"""
Stop hook: Claudeが1ターンの応答を終えるたびに発火する。
編集・作成されたファイルをsession-log.mdに追記する。
"""

import json
import sys
from datetime import datetime
from pathlib import Path


def main():
    # hookからのJSONを受け取る
    hook_input = json.load(sys.stdin)

    transcript_path = hook_input.get("transcript_path", "")
    cwd = hook_input.get("cwd", "")
    session_id = hook_input.get("session_id", "")

    session_log_path = Path(cwd) / "docs" / "session-log.md"

    if not session_log_path.exists():
        sys.exit(0)

    if not transcript_path or not Path(transcript_path).exists():
        sys.exit(0)

    # transcriptの最後の50行を読む（直近1ターン分の作業内容）
    with open(transcript_path, "r") as f:
        lines = f.readlines()

    recent_lines = lines[-50:] if len(lines) > 50 else lines

    # ツール使用（Write/Edit）を抽出
    # transcript構造: {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Edit", "input": {"file_path": "..."}}]}}
    edited_files = []
    for line in recent_lines:
        try:
            entry = json.loads(line)
            if entry.get("type") == "assistant":
                message = entry.get("message", {})
                content = message.get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            tool = block.get("name", "")
                            if tool in ["Write", "Edit", "MultiEdit"]:
                                inp = block.get("input", {})
                                path = inp.get("file_path") or inp.get("path", "")
                                if path:
                                    try:
                                        rel = Path(path).relative_to(cwd)
                                        edited_files.append(str(rel))
                                    except ValueError:
                                        edited_files.append(path)
        except (json.JSONDecodeError, KeyError):
            continue

    if not edited_files:
        sys.exit(0)

    # 重複排除
    edited_files = list(dict.fromkeys(edited_files))

    # session-log.mdに追記
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    short_session = session_id[:8] if session_id else "unknown"

    entry_lines = [
        f"\n#### Auto-logged: {timestamp} (session: {short_session})\n",
        f"\n編集ファイル:\n",
    ]
    for f in edited_files:
        entry_lines.append(f"- {f}\n")
    entry_lines.append("\n---\n")

    with open(session_log_path, "a") as f:
        f.writelines(entry_lines)

    print(
        f"session-log.md updated: {len(edited_files)} files logged",
        file=sys.stderr
    )


if __name__ == "__main__":
    main()
