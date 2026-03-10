#!/bin/bash
cd "$(dirname "$0")"
git checkout -- src/ tests/
echo "Task C reset to initial state"
