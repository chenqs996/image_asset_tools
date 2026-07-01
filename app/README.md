# 美术素材处理工具（V1）

Linux 优先的美术素材处理应用（前端实现），已覆盖：

- 切分工作台（父级 tab，含 2 个子功能）
	- 子 tab A：把图切成多个（3 模式：固定尺寸 / 固定数量 / 自动+手动切线）
	- 子 tab B：把高分辨率图生成多张不同尺寸的低分辨率图（仅缩小）
- 调整图片（抠除背景 / 抠除边框 / 移动居中）
	- 移动居中 V1：按前景包围盒中心对齐到画布中心
	- 移动居中 V1.5：批量中位锚点策略，降低多帧抖动
- 帧动画时间线编辑
- 批量导出命名规则
- 运行时插件动态加载

> 说明：顶层 `缩放` tab 已下线，原能力并入 `切分` tab 的「多尺寸低分图」子 tab。

## 处理页交互结构（当前）

- 顶层 tab：`切分` / `调整图片` / `动画`
- `切分` tab 内子 tab：
	- `切成多个`
	- `多尺寸低分图`
- 顶部 `导入 / 清空 / 导出` 与 `素材选择`：
	- 在顶层 tab 维度共享
	- 在 `切分` 的两个子 tab 间共享

## 导入与导出（当前规则）

- 导入弹窗支持：本地文件导入 + 从内部导入
- 从内部导入来源：其他 tab 的原始素材与处理结果（按名称排序）
- 导出结果来源（关键）：
	- 在 `切分` tab 时，导出当前子 tab 的结果
		- `切成多个`：导出切片预览结果
		- `多尺寸低分图`：导出低分辨率生成结果
	- 在 `调整图片` tab 时，导出调整后的结果
	- 在 `动画` tab 时，导出时间线帧

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
- `src/utils`：切分/多尺寸低分图/导出工具
- `public/plugins`：运行时插件清单与示例插件

## 插件动态加载

- 插件清单：`public/plugins/plugins.manifest.json`
- 启动后会尝试动态导入清单中 `entry` 指定的插件模块。

## ONNX Runtime 说明

- 依赖：`onnxruntime-web`
- 抠图 `AI通用` 模式会初始化 ONNX Runtime。
- 默认模型路径示例：`/models/u2net.onnx`（可在 UI 参数中修改）。
