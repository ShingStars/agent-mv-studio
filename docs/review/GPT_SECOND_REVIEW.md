# GPT 二审任务包

> 用法：把本文件连同仓库一起交给 GPT（或在 DSH 中切换到 GPT 模型后说"执行二审"）。
> 目标不是夸奖，而是**找出一审漏掉的问题**。

---

## 0. 你的角色

你是独立审核人，不是实现者。你的任务是判断这份交付**是否达到可开源、可复现、可被别的 Agent 使用**的标准。

规则：

1. 先读文档与源码，再看图，最后跑命令（可选）。
2. 每个扣分必须指向**具体文件、具体行、具体帧**。
3. 区分"事实错误"、"一致性错误"、"审美分歧"。
4. 不因为"看起来还不错"给高分；也不因为"和参考片不一样"扣分——本项目明确不复制素材。
5. 不改文件；只输出评审。

---

## 1. 项目是什么

`agent-mv-studio`：给 AI Agent 用的确定性 MV 渲染器。

- 输入：一首歌（WAV）+ LRC + 一个 `project.yaml`（分镜/风格/调色板/角色）。
- 编译：测 BPM/首拍 → 解析歌词 → 编译镜头 → `plan.json` + `STORYBOARD.md`。
- 渲染：Canvas2D 场景（纯 `f(t)`）→ WebGL2 后期 → Playwright 读像素 → FFmpeg 收流。
- 两种固定风格：
  - `plate`：1920×1080，三色纸版画、剪影、大字、错位；
  - `tui`：1280×720，左侧终端 + 右侧聊天窗、浅色纸张、蓝色人格。
- 附带：两套 29 秒 demo、QC 工具、7 个单元测试、完整文档。

---

## 2. 必读文件（按顺序）

1. `README.md`
2. `docs/METHODOLOGY.md`
3. `docs/WORKFLOW.md`
4. `docs/STYLE_PLATE.md`、`docs/STYLE_TUI.md`
5. `docs/QC.md`
6. `docs/CASE_STUDY.md`
7. `docs/review/SELF_REVIEW.md`
8. `docs/TUTORIAL.md`、`docs/PROMPTS.md`、`docs/AGENTS.md`

源码（按依赖顺序）：

```text
src/core/{time,lyrics,palette,surface,prng,assets,post,scene,film}.ts
src/kit/{paper,type,chat}.ts
src/compiler/{schema,analyze,compile}.ts
src/render/{host.html,host.js,server,browser,render}.ts
src/styles/plate/{common,scenes,index}.ts
src/styles/tui/{common,scenes,index}.ts
src/cli.ts
```

示例：

```text
examples/plate-demo/{project.yaml,lyrics.lrc,analysis.json,plan.json,STORYBOARD.md}
examples/tui-demo/{project.yaml,lyrics.lrc,plan.json,STORYBOARD.md}
```

---

## 3. 看图

- `docs/media/plate-sheet.png`（Plate 接触表）
- `docs/media/tui-sheet.png`（TUI 接触表）
- `examples/plate-demo/assets/figures/bust.png`、`hand.png`（GPT 剪影）
- 若仓库含成片：`examples/*/out/*.mp4`

看图时逐项问：

1. 三种画面（界面/版画/代码）是否一眼可分？
2. 三色是否严格（橙/米白/近黑，外加规定 spot）？
3. 关键词是否能在一帧内读完？
4. 剪影是否有五官/描边/渐变（应无）？
5. 红色是否只在规定 cue 之后出现？
6. 最后一帧是否干净、静止、最亮？
7. TUI 的浅色页面是否发灰/过曝？
8. 聊天窗是否像"她生活的房间"，而不是装饰？

---

## 4. 跑命令（可选，但建议）

```bash
pnpm install
pnpm run build
pnpm test
node dist/cli.js doctor
node dist/cli.js build examples/plate-demo
node dist/cli.js still examples/plate-demo --t 8.4 --out out/review-plate.png
node dist/cli.js still examples/tui-demo --t 2.0 --out out/review-tui.png
node tools/qc.mjs flash examples/plate-demo/out/film-1080p30.mp4
```

不要跑整片 4K 渲染（耗时）。

---

## 5. 评分维度（每项 1–10，必须给证据）

| 维度 | 问题 |
|---|---|
| A. 可运行性 | 从零 clone 到出第一张静帧，是否有未说明的坑？ |
| B. 可复现性 | 同一 `t` 是否确定？跨机器风险是否被诚实记录？ |
| C. 语法忠实度 | 是否真的复现了参考片的"三种画面/三色/错位/拍网格"？ |
| D. 工程严谨度 | 时间、歌词、调色板、资产、错误处理是否有漏洞？ |
| E. 文档可用性 | 一个陌生 Agent 能否只读文档就接手？ |
| F. 开源就绪度 | 许可、素材来源、敏感内容、仓库结构是否干净？ |

---

## 6. 必查清单

- [ ] `project.yaml` 里是否还有裸秒数没有 `why`？
- [ ] 场景里是否有 `Math.random()`、`Date.now()`、跨帧状态？
- [ ] `fade` 方向是否正确（前→后）？
- [ ] FFmpeg 提前退出是否会挂起？
- [ ] `mv_start` 元数据是否等于实际起始时间？
- [ ] BT.709 的 primaries/transfer 是否写入码流？
- [ ] 音频延迟是否等于 `-start`（preroll 时）？
- [ ] LRC 缺行时是否明确报错，而不是静默跳过？
- [ ] 剪影 alpha 阈值是否会把半透明边缘变成米白描边？
- [ ] 红色首次出现是否早于设定 cue？
- [ ] README 的截图路径是否真实存在？
- [ ] 文档里是否残留参考片的素材/链接/字体子集？
- [ ] LICENSE 与 CREDITS 是否覆盖代码、示例音乐、剪影、字体？
- [ ] `package.json` 的 repository 是否还是 `OWNER` 占位符？

---

## 7. 输出格式

先给结论，再给证据。

```json
{
  "verdict": "PASS | CONDITIONAL | FAIL",
  "scores": {
    "runnable": 0,
    "reproducible": 0,
    "grammar_fidelity": 0,
    "engineering": 0,
    "docs": 0,
    "open_source_ready": 0
  },
  "must_fix": [
    {"severity": "high|medium|low", "where": "path:line", "problem": "", "fix": ""}
  ],
  "should_fix": [
    {"where": "path:line", "problem": "", "fix": ""}
  ],
  "disagreements_with_self_review": [
    {"claim": "", "why": ""}
  ],
  "summary": "不超过 120 字"
}
```

然后附一段 300–600 字的中文总评，说明：

1. 这份交付最值得保留的三个设计；
2. 最可能让新用户失败的一个点；
3. 如果只修三处，应该修哪三处。

---

## 8. 审核边界

- 不评价"好不好看"以外的主观品味，除非违反风格规则。
- 不要求复刻参考片的镜头/素材/角色。
- 不把"没有 4K/没有 HDR/没有 forced alignment"单独判为失败——文档已声明为范围外。
- 不修改仓库；不执行整片渲染；不安装新依赖。

---

## 9. 已知上下文（避免误判）

- 示例歌是程序化合成的 98 BPM、29.39 秒，不是商业歌曲。
- 示例剪影由 GPT Image 生成，透明背景、单色；不是参考片素材。
- 参考片歌曲与歌词**不在**仓库内，也不应出现在仓库内。
- 本轮目标是"可复用的方法论 + 两套固定模板 + 可跑通的示例"，不是"复刻 4 分钟成片"。
