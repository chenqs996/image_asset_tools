#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-dev}"

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "==> 依赖未安装，先执行 npm install"
  npm install
fi

case "$MODE" in
  dev)
    PORT="${PORT:-5173}"
    echo "==> 启动开发模式（热更新），访问: http://localhost:${PORT}"
    npm run dev -- --host 0.0.0.0 --port "$PORT" --strictPort
    ;;
  preview)
    PORT="${PORT:-4173}"
    echo "==> 构建并启动预览模式，访问: http://localhost:${PORT}"
    npm run build
    npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort
    ;;
  *)
    echo "用法: bash ./scripts/run_app.sh [dev|preview]"
    exit 1
    ;;
esac
