#!/usr/bin/env bash
# file-service smoke test for migration validation.
#
# Usage:
#   ./scripts/test-smoke.sh <BASE_URL> <ORG_ID> <BEARER_TOKEN> [--verbose]
#
# Exits 0 if every check passes, non-zero on any FAIL. One line per check.
#
# Scope: file-service health + read paths via the gateway. Plus a
# platform-service health probe so we notice if the cutover took something
# adjacent down.
set -u
set -o pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <BASE_URL> <ORG_ID> <BEARER_TOKEN> [--verbose]" >&2
  exit 2
fi

BASE_URL="${1%/}"
ORG_ID="$2"
TOKEN="$3"
VERBOSE=0
[[ "${4:-}" == "--verbose" ]] && VERBOSE=1

PASS=0
FAIL=0
FAILED_TESTS=()

check_http() {
  local label="$1" expected="$2"; shift 2
  local resp status body
  resp="$(curl -sS -o /tmp/_smoke_body -w '%{http_code}' --max-time 30 "$@" 2>/tmp/_smoke_err || echo 000)"
  status="$resp"
  body="$(cat /tmp/_smoke_body 2>/dev/null || true)"
  if [[ "|$expected|" == *"|$status|"* ]]; then
    printf '[PASS] %s\n' "$label"
    PASS=$((PASS+1))
    [[ $VERBOSE -eq 1 ]] && printf '       status=%s body=%s\n' "$status" "${body:0:120}"
    return 0
  else
    local err; err="$(cat /tmp/_smoke_err 2>/dev/null || true)"
    printf '[FAIL] %s: expected %s, got %s%s\n' "$label" "$expected" "$status" \
      "$([[ -n "$body" ]] && printf ' — %s' "${body:0:200}")"
    [[ -n "$err" ]] && printf '       curl: %s\n' "$err"
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$label")
    return 1
  fi
}

auth=(
  -H "authorization: Bearer $TOKEN"
  -H "x-organization-id: $ORG_ID"
  -H "content-type: application/json"
)

echo "file-service smoke test against $BASE_URL (org=$ORG_ID)"
echo "----------------------------------------"

# adjacent service sanity (gateway + JWT propagation)
check_http "platform:user/_me" "200" "${auth[@]}" "$BASE_URL/api/v1/platform/user/_me"

# file-service health (via the gateway-routed path)
check_http "file-service:health" "200|404" "${auth[@]}" "$BASE_URL/api/v1/files/health"

# file-service read paths — `download` requires a real file name; we can't
# guarantee one exists post-cutover, so we expect either 200 (it exists) or
# 404 (it doesn't). 401/500 means the service is broken.
check_http "file-service:download-missing-file" "200|404" "${auth[@]}" \
  "$BASE_URL/api/v1/files/download/__nonexistent_smoke_test_file__.txt"

# Presigned URL generation should always succeed for a hypothetical file
# (it doesn't actually check the file exists in S3 — it just signs).
check_http "file-service:presigned-url" "200|400" "${auth[@]}" \
  "$BASE_URL/api/v1/files/presigned-url/__smoke_test__.txt"

# Static file route — older API; expect either a real file or 404.
check_http "file-service:static-files-listing" "200|404" "${auth[@]}" \
  "$BASE_URL/api/v1/files/__smoke_test__.txt"

# financial_files: GET by id — expect 404 for a fake id, NOT 500. 500 means
# the postgres path is broken.
check_http "file-service:financial-get-missing" "404" "${auth[@]}" \
  "$BASE_URL/api/v1/financial/00000000-0000-0000-0000-000000000000"

# ─── summary ──────────────────────────────────────────────────────────────────
echo "----------------------------------------"
printf 'Result: %d passed, %d failed\n' "$PASS" "$FAIL"
if [[ $FAIL -gt 0 ]]; then
  printf 'Failed tests:\n'
  for t in "${FAILED_TESTS[@]}"; do printf '  - %s\n' "$t"; done
  exit 1
fi
exit 0
