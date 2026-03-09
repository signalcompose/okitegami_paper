#!/usr/bin/env python3
import json, sys
data = json.load(sys.stdin)
with open('/tmp/stop_hook_debug.json', 'w') as f:
    json.dump(data, f, indent=2)
