#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-dev}"
AUTO_OPEN="${AUTO_OPEN:-1}"

TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
LOG_ROOT="$ROOT_DIR/logs"
SESSION_DIR="$LOG_ROOT/session-$TIMESTAMP"
APP_LOG="$SESSION_DIR/app.log"
META_LOG="$SESSION_DIR/meta.log"

mkdir -p "$SESSION_DIR"

if [[ "$MODE" == "dev" ]]; then
  PORT="${PORT:-5173}"
  TARGET_URL="http://localhost:${PORT}"
  RUN_CMD=(npm run dev -- --host 0.0.0.0 --port "$PORT" --strictPort)
elif [[ "$MODE" == "preview" ]]; then
  PORT="${PORT:-4173}"
  TARGET_URL="http://localhost:${PORT}"
  RUN_CMD=(npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort)
else
  echo "用法: bash ./scripts/run_app_with_logs.sh [dev|preview]"
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "==> 依赖未安装，先执行 npm install"
  npm install
fi

{
  echo "timestamp=$TIMESTAMP"
  echo "mode=$MODE"
  echo "cwd=$ROOT_DIR"
  echo "target_url=$TARGET_URL"
  echo "node=$(node -v 2>/dev/null || echo unknown)"
  echo "npm=$(npm -v 2>/dev/null || echo unknown)"
  echo "os=$(uname -a 2>/dev/null || echo unknown)"
  echo "git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
} > "$META_LOG"

echo "==> 日志目录: $SESSION_DIR"
echo "==> 应用日志: $APP_LOG"
echo "==> 环境日志: $META_LOG"

if [[ "$MODE" == "preview" ]]; then
  echo "==> preview 模式先执行构建（日志会写入 app.log）"
  npm run build 2>&1 | tee -a "$APP_LOG"
fi

if [[ "$AUTO_OPEN" == "1" ]]; then
  (
    for _ in {1..60}; do
      if curl -fsS "$TARGET_URL" >/dev/null 2>&1; then
        if command -v xdg-open >/dev/null 2>&1; then
          echo "==> 打开浏览器: $TARGET_URL" | tee -a "$APP_LOG"
          xdg-open "$TARGET_URL" >/dev/null 2>&1 || true
        else
          echo "[WARN] 未找到 xdg-open，请手动访问: $TARGET_URL" | tee -a "$APP_LOG"
        fi
        exit 0
      fi
      sleep 0.25
    done
    echo "[WARN] 服务未在预期时间就绪，请查看日志: $APP_LOG" | tee -a "$APP_LOG"
  ) &
fi

echo "==> 启动应用并记录日志... (Ctrl+C 停止)" | tee -a "$APP_LOG"
(
  set -o pipefail
  DEBUG="${DEBUG:-vite:*}" "${RUN_CMD[@]}" 2>&1 | tee -a "$APP_LOG"
  exit "${PIPESTATUS[0]}"
)
