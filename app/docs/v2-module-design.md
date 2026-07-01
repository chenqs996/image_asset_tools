# V2 模块功能拆解与技术设计（交互先行版）

## 1. 设计目标

在不破坏现有可用能力的前提下，引入 V2 的模板化导出交互，并按模块分层推进实现：

- 先完成交互与参数流
- 再逐步落地功能实现
- 保持 UI / 业务编排 / 处理引擎解耦

---

## 2. 当前实现状态（本次已落地）

已在 `ProcessPage` 导出弹窗中加入 **V2 交互预览模式**：

1. 模式切换：`经典导出` / `V2 交互预览`
2. V2 模板切换：
   - 图集打包
   - 动画序列导出
   - 游戏 UI 专用切图
   - Godot 对接
3. 每个模板都有独立参数区（当前仅交互，不执行业务）
4. `确认（交互预览）` 仅做前端校验并显示状态，不触发真实导出

---

## 3. 架构分层（目标）

## 3.1 展示层（UI）

**职责**：

- 参数输入
- 交互切换
- 预览展示
- 校验提示与状态反馈

**建议模块**：

- `ui/pages/process/components/export/ExportModeSwitch.tsx`
- `ui/pages/process/components/export/V2TemplateTabs.tsx`
- `ui/pages/process/components/export/templates/AtlasTemplateForm.tsx`
- `ui/pages/process/components/export/templates/AnimationTemplateForm.tsx`
- `ui/pages/process/components/export/templates/UiSliceTemplateForm.tsx`
- `ui/pages/process/components/export/templates/GodotTemplateForm.tsx`
- `ui/pages/process/components/export/ExportPreviewPanel.tsx`

## 3.2 编排层（Workflow / Hook）

**职责**：

- 管理模板状态
- 统一参数校验
- 组装导出任务描述（TaskSpec）
- 触发执行器并回写状态

**建议模块**：

- `ui/pages/process/hooks/useExportV2Workflow.ts`
  - `mode` / `template` / `templateConfig`
  - `validate()`
  - `buildTaskSpec()`
  - `submitPreview()`（当前已等效）
  - `submitReal()`（后续）

## 3.3 领域层（Schema / Domain）

**职责**：

- 定义模板配置结构
- 定义导出任务模型
- 定义产物描述与错误类型

**建议模块**：

- `core/export-v2/types.ts`
  - `ExportTemplateType`
  - `ExportProfileBase`
  - `AtlasConfig / AnimationConfig / UiSliceConfig / GodotConfig`
  - `ExportTaskSpec`
  - `ExportArtifact`
  - `ExportIssue`

- `core/export-v2/validation.ts`
  - 模板级校验器

## 3.4 执行层（Engine）

**职责**：

- 真正处理图像与元数据
- 输出产物
- 记录日志与统计

**建议模块**：

- `core/export-v2/engines/atlasEngine.ts`
- `core/export-v2/engines/animationEngine.ts`
- `core/export-v2/engines/uiSliceEngine.ts`
- `core/export-v2/engines/godotPackEngine.ts`
- `core/export-v2/exportOrchestrator.ts`

## 3.5 适配层（I/O）

**职责**：

- 文件命名
- 打包 ZIP
- manifest 生成
- 日志写入

**建议模块**：

- `core/export-v2/io/fileNamePolicy.ts`
- `core/export-v2/io/zipWriter.ts`
- `core/export-v2/io/manifestWriter.ts`
- `core/export-v2/io/exportLogger.ts`

---

## 4. 功能模块拆解（按优先级）

## 4.1 模块 A：V2 模板导出交互（已开始）

### 已完成
- 模板切换与参数表单
- 交互预览确认
- 基础校验提示

### 待完成
- 将当前散落在 `ProcessPage` 的 V2 状态抽离到 `useExportV2Workflow`
- 模板表单组件化
- 导出预览面板独立组件

## 4.2 模块 B：图集打包（首发真功能）

### 输入
- 素材列表
- AtlasConfig（尺寸、策略、padding、extrude、POT、rotate）

### 输出
- atlas PNG（单页或多页）
- atlas metadata JSON
- 统计摘要

### 注意点
- 稳定可复现排序
- 超尺寸素材回退策略
- 失败项不中断整批

## 4.3 模块 C：动画序列导出

### 输入
- 时间线序列
- 动画配置（fps/loop）
- 锚点配置（中心/底边中心/自定义）

### 输出
- 序列帧 + JSON
- spritesheet + index JSON
- animation 描述 JSON（Godot 可读）

### 注意点
- 锚点单位切换（归一化 / 像素）
- 帧顺序与 timeline 一致

## 4.4 模块 D：UI 专用切图增强

### 输入
- UI 原图
- 9-slice 参数
- 倍率列表
- 状态后缀规则

### 输出
- 9-slice 图与参数
- 多倍率资源
- 状态拆分结果

### 注意点
- 后缀识别冲突与缺失提示
- 非法倍率过滤与提示

## 4.5 模块 E：Godot 资源包对接（首发 JSON）

### 输入
- 上述模块产物
- Godot 配置（metadata format、manifest、log）

### 输出
- Godot 可读 metadata JSON
- manifest.json
- 导出日志

### 注意点
- 路径与命名统一
- 资源引用可追溯

---

## 5. 关键数据结构（建议）

```ts
export type ExportTemplateType = 'atlas' | 'animation' | 'ui_slice' | 'godot_package'

export interface ExportTaskSpec {
  profileName: string
  outputFolder: string
  scope: 'all' | 'selected'
  template: ExportTemplateType
  payload: AtlasConfig | AnimationConfig | UiSliceConfig | GodotConfig
  sourceAssetIds: string[]
  createdAt: string
}

export interface ExportArtifact {
  fileName: string
  mimeType: string
  bytes: Blob
  category: 'texture' | 'metadata' | 'manifest' | 'log'
}

export interface ExportIssue {
  level: 'warning' | 'error'
  code: string
  message: string
  relatedAssetId?: string
}
```

---

## 6. 迭代落地计划

## Sprint 1（交互稳定化）

- 抽离 `useExportV2Workflow`
- 拆分 4 个模板表单组件
- 形成统一 `TaskSpec`（仍可 mock 执行）

## Sprint 2（图集打包首发）

- Atlas 引擎 + metadata JSON
- ZIP/manifest/log 接入
- 回归测试（<200 张）

## Sprint 3（动画与 UI）

- 动画 3 种导出形态
- UI 三项增强
- Godot package 聚合

## Sprint 4（工程化完善）

- 性能与稳定性优化
- 错误码系统
- 文档与示例

---

## 7. 验收清单（交互先行阶段）

1. 能在导出弹窗中切换 `经典` 与 `V2 交互预览`
2. 能切换 4 类模板并看到对应配置项
3. 交互确认不会触发真实导出（仅状态反馈）
4. 校验失败时有明确提示
5. 不影响现有经典导出能力

---

## 8. 风险与约束

1. `ProcessPage` 继续膨胀风险（需尽快抽 hook + 组件）
2. 图像处理在主线程可能卡顿（后续可评估 Worker）
3. Godot 侧规范需尽早固定字段，避免返工
4. 多模板共用输入时要统一命名与路径策略
