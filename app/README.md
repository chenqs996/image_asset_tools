# 美术素材处理工具（V1）

Linux 优先的美术素材处理应用（前端实现），已覆盖：

- 图片切分（3 模式）
- 缩放预览（仅缩小）
- 抠图（三档算法 + ONNX Runtime）
- 帧动画时间线编辑
- 批量导出命名规则
- 运行时插件动态加载

## 环境要求

- Node.js >= 20
- npm >= 10

## 本地开发

```bash
npm install
npm run dev
```

## 手动验收运行（自动打开浏览器）

```bash
npm run run:open
```

## 调试运行（自动记录日志）

```bash
npm run run:debug
```

或使用预览模式：

```bash
npm run run:debug:preview
```

日志输出目录：`app/logs/session-时间戳/`

- `app.log`：应用运行日志（含 Vite 调试输出）
- `meta.log`：环境信息（Node/npm/OS/commit/模式）

可选参数示例：

```bash
PORT=5180 npm run run:debug
AUTO_OPEN=0 npm run run:debug
DEBUG='vite:*' npm run run:debug
```

> 说明：运行脚本使用 `--strictPort`，如果端口被占用会直接报错退出，避免“打开了错误端口导致页面不可访问”的问题。

## 回归验证（Week6）

```bash
npm run verify
```

该命令顺序执行：

1. `npm run lint`
2. `npm run test`
3. `npm run build`

## 构建与预览

```bash
npm run build
npm run preview
```

构建产物目录：`dist/`

## 关键目录

- `src/ui`：页面与组件
- `src/core`：服务与状态管理
- `src/contracts`：Provider 协议
- `src/providers`：内置 Provider 注册
- `src/platform`：平台桥接
- `src/utils`：切分/缩放/导出工具
- `public/plugins`：运行时插件清单与示例插件

## 插件动态加载

- 插件清单：`public/plugins/plugins.manifest.json`
- 启动后会尝试动态导入清单中 `entry` 指定的插件模块。

## ONNX Runtime 说明

- 依赖：`onnxruntime-web`
- 抠图 `AI通用` 模式会初始化 ONNX Runtime。
- 默认模型路径示例：`/models/u2net.onnx`（可在 UI 参数中修改）。
