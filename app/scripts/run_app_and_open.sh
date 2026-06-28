#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-dev}"

if [[ "$MODE" == "dev" ]]; then
  PORT="${PORT:-5173}"
  TARGET_URL="http://localhost:${PORT}"
  START_CMD=(bash ./scripts/run_app.sh dev)
elif [[ "$MODE" == "preview" ]]; then
  PORT="${PORT:-4173}"
  TARGET_URL="http://localhost:${PORT}"
  START_CMD=(bash ./scripts/run_app.sh preview)
else
  echo "用法: bash ./scripts/run_app_and_open.sh [dev|preview]"
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "==> 依赖未安装，先执行 npm install"
  npm install
fi

"${START_CMD[@]}" &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> 等待服务启动: $TARGET_URL"
READY=0
for _ in {1..40}; do
  if curl -fsS "$TARGET_URL" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.25
done

if [[ "$READY" -eq 1 ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    echo "==> 打开浏览器: $TARGET_URL"
    xdg-open "$TARGET_URL" >/dev/null 2>&1 || true
  else
    echo "[WARN] 未找到 xdg-open，请手动访问: $TARGET_URL"
  fi
else
  echo "[WARN] 服务未在预期时间内就绪，请手动检查终端输出。"
fi

wait "$SERVER_PID"
