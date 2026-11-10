#!/bin/bash
HASH=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 8)
sed -i '' "s|dist/app.min.css[^\"]*|dist/app.min.css?v=$HASH|g" index.html strava-alternative.html stickers.html
echo "Cache bust: $HASH"
