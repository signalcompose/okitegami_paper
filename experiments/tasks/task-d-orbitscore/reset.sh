#!/bin/bash
cd "$(dirname "$0")"
git checkout -- src/ tests/
echo "Task D reset to initial state"
