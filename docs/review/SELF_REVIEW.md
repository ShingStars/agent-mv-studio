# 自审报告（第一轮）

> 审核人：实现方（DeepSeek Harness / DeepSeek 模型）
> 日期：2026-10-18
> 范围：`agent-mv-studio` 全部源码、文档、示例、成片
> 结论：**可交付二审**（存在已知缺口，见第 6 节）

---

## 1. 交付物

| 类别 | 路径 | 状态 |
|---|---|---|
| 引擎 | `src/core/**` | 完成 |
| 绘制件 | `src/kit/**` | 完成 |
| 编译器 | `src/compiler/**` | 完成 |
| 渲染管线 | `src/render/**` | 完成 |
| 风格 A | `src/styles/plate/**` | 完成 |
| 风格 B | `src/styles/tui/**` | 完成 |
| CLI | `src/cli.ts` | 完成 |
| 示例 | `examples/plate-demo`、`examples/tui-demo` | 完成 |
| 文档 | `README.md`、`docs/*.md` | 完成 |
| 测试 | `test/core.test.ts` | 7/7 通过 |
| 验收工具 | `tools/qc.mjs`、`tools/synth-demo.mjs` | 完成 |
| 成片 | 两个 demo MP4 | 已渲染（见第 3 节） |

---

## 2. 需求对照

| 用户要求 | 实现 | 证据 |
|---|---|---|
| 读完四份参考 | 两支视频逐帧抽检 + 两个仓库源码/文档通读 | `docs/CASE_STUDY.md` |
| 可复用方法论 | `docs/METHODOLOGY.md` | frame=f(t)、三层时间、可信度标签 |
| 工作流程 | `docs/WORKFLOW.md` | G0–G6、C/V/人三角色 |
| 两种风格的固定模板 | `docs/STYLE_PLATE.md`、`docs/STYLE_TUI.md` + 29 秒模板 | 两套 11 镜 demo |
| 换歌/换剧本可生成 | `project.yaml` + `build` + `analyze` | 两套 demo 用同一引擎 |
| 核心代码由本模型完成 | 全部 `src/**` | git 历史 |
| 识图/生图由 GPT 完成 | 剪影由 GPT Image 生成 | `examples/plate-demo/assets/figures/*.png` |
| 开工前详细计划 | `../_plan/PLAN.md`（仓库外） | 已按计划推进 |
| 本模型一审 | 本文件 | — |
| GPT 二审 | 待执行 | `docs/review/GPT_SECOND_REVIEW.md` |
| 工作流程/介绍/教程 | `docs/WORKFLOW.md`、`README.md`、`docs/TUTORIAL.md` | — |
| GitHub 开源 | 待发布 | 第 7 节 |

---

## 3. 验证结果

### 3.1 构建与测试

```text
pnpm run build      → tsc 通过
pnpm test           → 7 passed, 0 failed
pnpm typecheck      → 无输出
```

### 3.2 成片

| 项目 | 分辨率 | 帧率 | 时长 | 帧数 | 大小 |
|---|---|---|---|---|---|
| plate-demo | 1920×1080 | 30 | 33.39 s | 1002 | 约 39.5 MB |
| tui-demo | 1280×720 | 24 | 33.38 s | 801 | 约 12 MB |

### 3.3 确定性

同一时刻 `t=8.4` 渲染两次，PNG SHA-256 完全一致：

```text
CDB4E1FC...F08  out/det-a.png
CDB4E1FC...F08  out/det-b.png
```

### 3.4 闪光/亮度

```text
plate:  max round-trips/s 0, max single-frame change 0.017 → PASS
tui:    max round-trips/s 0, max single-frame change 0.091 → PASS
```

4K 抽样：`--start 8.4 --end 8.9 --width 3840 --height 2160 --fps 60` 输出 30 帧，
耗时 51 秒（0.6 fps），确认尺寸与编码路径可用；整片 4K 约 55 分钟。

### 3.5 音频分析

```text
bpm 98.00 · first beat 0.604s · confidence 100% · 48 beats · 25 onsets
```

0.604 s 是真实的第一拍：合成音频有 1.2 s 淡入，LRC 第一行从 0.0 s 开始，
两者差异是有意保留的"人声先行、伴奏后入"。

---

## 4. 审核中发现并修复的问题

| # | 问题 | 影响 | 修复 |
|---|---|---|---|
| 1 | FFmpeg 提前退出时渲染循环仍等待帧 | 任务挂起、0 字节输出 | `ff.stdin` 错误监听 + 每帧检查 `ffDead`；`FrameChannel.request` 30 s 超时 |
| 2 | 淡入淡出方向相反（`uA`/`uB` 上传顺序） | 切换瞬间黑闪，QC 单帧变化 0.713 | 交换纹理上传：uA=上一镜、uB=当前镜 |
| 3 | 后期暗角/颗粒把浅色 TUI 页面洗白 | 纸面发灰、发亮 | `StyleDefinition.post` 按风格覆盖；TUI 用 grain .006 / vignette .08 / scan 0 |
| 4 | 聊天窗 `you` 气泡用 `pal.text` 填充 | 深色页面上看不见 | 新增 `bubble`/`bubbleInk` 角色 |
| 5 | `line:` 消息渲染空气泡 | 聊天窗只有小方块 | 回退到 `line.text` |
| 6 | `layout: settings` 写在 shot 层被忽略 | 设置面板不出现 | 移入 `params:` |
| 7 | 关键词被深色底带覆盖 | 字母下缘被切 | 底带绘制顺序提前 |
| 8 | 标题下划线宽度按全标题计算 | 与逐字显示不同步 | 用当前显示文本测量 |
| 9 | PowerShell `Set-Content` 破坏 UTF-8 | 测试文件乱码 | 全程改用 `write`/`edit` 工具 |

---

## 5. 与参考片的差异（有意为之）

1. **不复制素材**：剪影为本项目 GPT 生成，构图/配色/字体子集均独立。
2. **不做 HTML 截图**：TUI 页面直接代码绘制，跨机器一致。
3. **不做强制对齐**：LRC 词标签 + 音节估算，够 MV，不够卡拉 OK。
4. **先 1080p 后 4K**：4K 仅改 `--width/--height`，未在本轮验收。
5. **示例 29 秒**：用 11 个镜头证明语法，不用 87 个镜头证明产能。

---

## 6. 已知缺口

| 缺口 | 严重度 | 计划 |
|---|---|---|
| 剪影边缘 1px 米白描边 | 低 | 可加 `alphaCut` 或形态学收缩；不影响 1080p 观感 |
| 标题下划线仍有 2–3px 偏移 | 低 | 下一轮调 `measure` 基线 |
| `windowFrame` 未被使用 | 极低 | 删除或接入 shell 场景 |
| 4K 未实测 | 中 | 已抽 30 帧验证；整片未跑 |
| 跨机器字体抗锯齿差异 | 中 | 文档已声明；QC 记录浏览器版本 |
| 无 forced alignment | 中 | 已在 METHODOLOGY 标注为已知限制 |
| GPT 二审未执行 | 高 | 见 `docs/review/GPT_SECOND_REVIEW.md` |

---

## 7. 发布前清单

- [x] `pnpm run build`
- [x] `pnpm test`
- [x] 两套 demo `build` 无错误
- [x] 两套 demo 静帧/接触表检查
- [x] 成片渲染
- [x] 闪光 QC
- [x] 确定性检查
- [x] README/教程/方法论/风格圣经/提示词/QC
- [x] LICENSE / CREDITS / .gitignore
- [ ] TUI 复测 + 4K 抽样
- [ ] GPT 二审
- [ ] GitHub 仓库创建与推送

---

## 8. 自评

| 维度 | 分数 | 说明 |
|---|---|---|
| 可运行性 | 9/10 | 一条命令从零到成片；挂起问题已修 |
| 可复现性 | 9/10 | 同机像素级一致；跨机受字体/浏览器影响 |
| 可维护性 | 8/10 | 核心/kit/style 分层清楚；部分场景参数偏多 |
| 文档完整度 | 9/10 | 方法论到故障排查齐全 |
| 与参考的忠实度 | 8/10 | 语法忠实；素材与节奏规模不同 |
| 工程严谨度 | 8/10 | 有测试/QC/确定性；缺 CI |

**总评：8.5/10，建议进入 GPT 二审。**
