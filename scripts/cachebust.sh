#!/bin/bash
HASH=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 8)
printf '{\n    "cssVersion": "%s"\n}\n' "$HASH" > src/_data/build.json
echo "Cache bust: $HASH"
