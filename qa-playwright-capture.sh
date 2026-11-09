#!/usr/bin/env bash
set -e
URL="${1:-http://localhost:3000}"
OUT="${2:-public/qa-screenshots}"
pnpm tsx scripts/qa-capture.ts "$URL" "$OUT"
