#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOC_PATH="$ROOT_DIR/../docs/验收测试用例文档.md"

echo "==> [V1] 验收自动化检查开始"
cd "$ROOT_DIR"

echo "==> 1) 运行 lint + test + build"
npm run verify

echo "==> 2) 校验关键文件"
required_files=(
  "$ROOT_DIR/src/ui/pages/ProcessPage.tsx"
  "$ROOT_DIR/src/ui/pages/ExportPage.tsx"
  "$ROOT_DIR/public/plugins/plugins.manifest.json"
  "$ROOT_DIR/dist/index.html"
)

for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[ERROR] 缺少关键文件: $f"
    exit 1
  fi
done

echo "==> 3) 校验插件 manifest JSON"
node -e "const fs=require('fs'); const p=process.argv[1]; JSON.parse(fs.readFileSync(p,'utf8'));" "$ROOT_DIR/public/plugins/plugins.manifest.json"

echo "==> 4) ONNX 模型路径提示（非阻断）"
if [[ ! -f "$ROOT_DIR/public/models/u2net.onnx" ]]; then
  echo "[WARN] 未发现 $ROOT_DIR/public/models/u2net.onnx"
  echo "       AI通用模式将走回退逻辑；如需真实模型推理请补充模型文件。"
fi

echo "==> 5) 手工验收提醒"
if [[ -f "$DOC_PATH" ]]; then
  echo "请按文档执行手工用例: $DOC_PATH"
else
  echo "[WARN] 未找到验收用例文档: $DOC_PATH"
fi

echo "==> [V1] 验收自动化检查通过"
