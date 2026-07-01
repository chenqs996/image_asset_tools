# 美术素材处理工具

一个面向 **游戏开发素材生产流程** 的本地图片处理工具，当前聚焦 **Godot 4.x** 使用场景。项目提供切图、图片调整、动画时间线整理，以及 Atlas / 动画 / UI / Godot 资源包等导出能力，帮助把素材从“原图”更顺滑地推进到“可进引擎”的状态。

> 当前前端应用位于 `app/` 目录；日常安装、启动、构建命令也都在 `app/` 内执行。

## ✨ 功能特性

### 图片切分

- 固定尺寸切分
- 固定数量切分
- 自动 / 手动切线切分

### 多尺寸低分图生成

- 从高分辨率素材批量生成多个缩小版本
- 适合 UI、多分辨率资源准备

### 图片调整

- 抠除背景
- 抠除边框
- 内容移动居中
- 批量中位锚点对齐，降低动画抖动

### 动画时间线

- 管理帧顺序
- 组织动画帧预览
- 为动画导出提供输入数据

### 导出能力

- 经典导出：按命名规则批量导出图片
- V2 模板导出：
  - Atlas 图集打包
  - 动画序列导出
  - UI 专用切图导出
  - Godot 资源包导出

## 🚀 快速开始

### 环境要求

- Node.js 20+
- npm 10+

### 安装依赖

```bash
cd app
npm install
```

### 启动开发环境

```bash
cd app
npm run dev
```

自动打开浏览器：

```bash
cd app
npm run run:open
```

## 🧭 使用流程

1. 启动项目并进入处理页
2. 点击顶部 **导入** 按钮导入本地图片
3. 根据目标选择模块：
   - `切分`
   - `调整图片`
   - `动画`
4. 在当前模块中配置参数并预览结果
5. 点击 **导出**，选择：
   - 经典导出
   - V2 模板导出

## 📦 V2 导出亮点

- **Atlas**
  - 支持 trim
  - 支持 extrude
  - 支持旋转打包
  - 支持多种策略：`balanced` / `min_pages` / `min_waste`

- **Animation**
  - 序列帧导出
  - SpriteSheet 导出
  - Godot 动画描述 JSON

- **UI Slice**
  - 多倍率导出
  - 状态图后缀识别
  - 九宫格 metadata 输出

- **Godot Package**
  - 纹理 + metadata + manifest 结构化导出

## 🛠 技术栈

- React 19
- TypeScript
- Vite
- Vitest
- Oxlint
- JSZip
- onnxruntime-web

## 📁 项目结构

```text
img_tools/
├─ app/        # 前端应用主体
│  ├─ src/     # 页面、组件、核心逻辑
│  ├─ public/  # 静态资源
│  └─ scripts/ # 启动与调试脚本
└─ docs/       # 设计文档、需求文档、路线说明
```

## 🧪 开发命令

以下命令均在 `app/` 目录下执行。

```bash
npm run dev
npm run test
npm run build
npm run preview
npm run verify
```

- `npm run dev`：启动开发环境
- `npm run test`：运行测试
- `npm run build`：构建生产版本
- `npm run preview`：预览构建结果
- `npm run verify`：执行 lint + test + build

## 🗺 路线方向

- [x] 切分 / 多尺寸低分图 / 调整图片 / 动画时间线
- [x] V2 模板化导出基础落地
- [x] Atlas trim / extrude / 旋转打包
- [ ] 更完整的 Godot 资源描述输出
- [ ] 更强的 UI 九宫格参数可视化
- [ ] 更多引擎导出模板（Unity / Cocos 等）

## 🤝 贡献说明

欢迎提交 Issue 或 PR，一起把这个工具打磨成更顺手的素材流水线小帮手。

如果你准备参与开发，建议先阅读：

- `docs/` 下的需求与设计文档
- `app/src/core/export-v2/` 下的导出模块实现

## 📄 License

本项目采用 [MIT License](./app/LICENSE)。许可证文件位于 `app/LICENSE`。
