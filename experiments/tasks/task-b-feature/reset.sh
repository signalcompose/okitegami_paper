#!/bin/bash
cd "$(dirname "$0")"
git checkout -- src/ tests/
echo "Task B reset to initial state"
