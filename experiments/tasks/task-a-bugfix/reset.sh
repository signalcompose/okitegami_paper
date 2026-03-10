#!/bin/bash
cd "$(dirname "$0")"
git checkout -- src/ tests/
echo "Task A reset to initial state"
