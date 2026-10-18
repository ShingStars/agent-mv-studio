# 工作流：让 Agent 从一首歌走到一支片

> 目标不是"一次生成"，而是**一条可审查的流水线**：
> 每一步都有输入、产物、验收标准；任何一步失败，都能只重跑这一步。

---

## 0. 角色分工

一支 Agent MV 建议至少两个角色（同一个模型可以兼任，但审查必须分人/分会话）：

| 角色 | 能力 | 负责 | 不负责 |
|---|---|---|---|
| **C — Code Agent**（DSH / Codex / Claude Code） | 文件、命令、浏览器、渲染 | 仓库、引擎、时间线、场景、编译、渲染、技术验收 | 画面审美终审、图像生成 |
| **V — Vision Agent**（GPT / 多模态模型） | 读图、生图 | 剪影/关键帧生成、静帧审美评审、叙事可读性 | 改代码、改时间线、决定技术实现 |

分工原则：**C 写"怎么画"，V 判断"画得对不对"。**
C 不能既生成又终审自己的画面；V 不碰代码，只给"通过 / 退回 + 具体帧 + 理由"。

---

## 1. 端到端流程（六个检查点）

```
G0 立项      →  brief.md（歌、风格、时长、授权、交付物）
G1 测量      →  analysis.json + 时间表
G2 世界圣经  →  world.md（角色/色彩/规则/段落曲线）
G3 分镜      →  project.yaml + plan.json + STORYBOARD.md
G4 资产      →  figures/*.png + keyframes/*.png（V 生成，C 接入）
G5 静帧验收  →  sheet / strip / 逐镜头静帧 + QC 报告
G6 成片      →  film.mp4 + 验收记录 + 发布包
```

每个检查点都必须有**可打开的产物**，不允许"口头通过"。

---

## 2. G0 立项

写 `brief.md`，至少包含：

```markdown
# 项目简报
- 歌曲：<文件> / <BPM 未知或已知> / <时长>
- 授权：<自作曲 / CC0 / 已获授权 / 仅内部>
- 风格：plate | tui
- 交付：1920x1080 30fps / 1280x720 24fps / 其他
- 叙事一句话：<谁，在什么世界里，想要什么，发生了什么>
- 禁止项：<不出现真人脸 / 不使用某素材 / 不出现品牌>
```

授权是硬门槛。**没有授权的歌，只能本地实验，不能公开传播。**

---

## 3. G1 测量（Code Agent）

```bash
node dist/cli.js analyze <project> --force
```

产物 `analysis.json`：

- `bpm`、`firstBeat`、`beatsPerBar`、`confidence`；
- `beatTimes`（实测拍点）、`downbeats`；
- `onsets`（强起音）；
- `envelope`（rms/low/mid/high/vocal，供场景做脉冲）。

验收：

- [ ] `confidence` 可接受（<0.6 时人工确认 BPM；Agent 应提示用户 toe-tap 或改 `bpm` 手填）；
- [ ] `firstBeat` 与音频第一个可听拍一致（静默前奏要单独处理）；
- [ ] 把 `beatTimes` 叠在波形上抽查 3 个位置，误差 < 1 帧。

如果 BPM 明显错（半速/倍速），在 `project.yaml` 里写死 `bpm` 与 `firstBeat`，仍保留 `beatTimes` 用于微调。

---

## 4. G2 世界圣经（C + V）

写 `world.md`，只写"不可协商"的部分：

```markdown
## 角色
- 我：橙色剪影，无脸，衬线字，坐在窗口里
- 你：米白，不出现实体，只用光标/气泡/输入框表示
- 系统：黑色终端，等宽字，只陈述事实

## 颜色
- 橙 #d97757 = 我
- 米白 #faf9f5 = 你
- 红 #f5506f = 错误（首次出现必须在 2/3 处之后）
- 灰 = 缺席/终止

## 规则
- 剪影不能有五官，不能动嘴
- 版画必须三色，允许错位但只在最后副歌
- 最后一个镜头必须干净且最亮
```

验收：V 能只读 `world.md` 就判断一张新图"是否属于这个世界"。

---

## 5. G3 分镜（Code Agent）

从段落表写 `project.yaml`：

```yaml
meta:
  title: world.ping(you);
  style: plate
  width: 1920
  height: 1080
  fps: 30
  seed: 20161011
song:
  audio: audio.wav
  lrc: lyrics.lrc
  bpm: auto
  firstBeat: auto
  preroll: 4
sections:
  - id: A
    palette: off
    shots:
      - at: { time: -4 }
        until: { time: 0 }
        scene: boot
        moment: "系统先警告：接下来有闪光"
      - at: { bar: 0 }
        until: { line: 1 }
        scene: title
        moment: "片名出现，世界还没开始"
        palette: off
```

```bash
node dist/cli.js build <project>
```

产物：

- `plan.json`：编译器认为的最终时间线（只读，不再手改）；
- `STORYBOARD.md`：人读的分镜表（时间、bar:beat、镜头、歌词、moment、调色板、入场）。

验收：

- [ ] 每个镜头都有 `moment`；
- [ ] 没有重叠、没有空洞、没有越过歌曲结尾；
- [ ] 所有 `initial` 时间都被替换或明确标注；
- [ ] 段落曲线与 `world.md` 一致。

`build` 报错是好事：它在渲染前拦截"歌词行不存在 / 场景未注册 / 时间无法解析"。

---

## 6. G4 资产（Vision Agent 生成，Code Agent 接入）

### 6.1 剪影/图形（Plate）

给 V 的订单必须写清**技术规格**，否则生成的图不能用：

```text
- 单色平涂剪影，纯透明背景，PNG
- 颜色 #D97757，无渐变、无纹理、无投影、无描边
- 无五官、无文字、无水印
- 主体居中，四周留 ≥8% 空白
- 输出长边 ≥1200 px
- 只描述姿态与轮廓，不描述"风格参考某画师"
```

接入：放进 `assets/figures/`，在 `project.yaml` 注册：

```yaml
figures:
  - id: her
    file: assets/figures/bust.png
    inks: [me, text, black]
```

`Figure` 会把图按亮度/饱和度拆成三层油墨遮罩，再用当前调色板重新上色。
所以**原图只需要单色**，换调色板不需要重新生成。

### 6.2 关键帧（可选）

用于对齐参考构图，不直接进成片。V 生成后由 C 看，提炼成参数（位置、字号、裁切），不把位图贴进画面。

### 6.3 资产验收

- [ ] 透明背景（alpha 二值或干净边缘）；
- [ ] 单色/三色以内，无渐变；
- [ ] 缩小到 480 px 仍可辨认；
- [ ] 无文字、无水印、无签名；
- [ ] 授权明确（自生成 / CC0 / 已授权）。

不合格的资产直接退回，不要让引擎"修一修"——修出来的边缘会在 4K 暴露。

---

## 7. G5 静帧验收（C 自检 + V 二审）

### 7.1 C 的自检

```bash
node dist/cli.js sheet <project> --times 0,4,8,12,16,20,24,28 --cols 4 --out out/sheet.png
node dist/cli.js strip <project> --t <关键切点> --out out/strip.png
node dist/cli.js check <project> --t 8.4          # 同帧两次哈希一致
node tools/qc.mjs flash <project>/out/film.mp4    # 闪光预算
```

逐镜头看：

- 构图是否一镜一事；
- 字是否被剪影/背景吃掉；
- 调色板语义是否守；
- 三层是否都在；
- 切点前后运动是否连续（strip 看 15 帧）。

### 7.2 V 的审美评审

把接触表 + 3–5 张关键静帧交给 V，用 `docs/PROMPTS.md` 里的评审提示词，要求：

- 按 1–5 分打分（叙事清晰度、风格一致性、可读性、情绪峰值、技术瑕疵）；
- 每个扣分必须指向具体帧与具体区域；
- 给出"通过 / 退回重做哪几镜"的明确结论。

C 不允许用"我觉得"覆盖 V 的具体意见；有分歧时，以 `world.md` 的规则为准。

---

## 8. G6 成片

```bash
node dist/cli.js render <project> --out out/film.mp4
node tools/qc.mjs flash out/film.mp4
ffprobe -v error -show_entries format_tags=comment -of default=nw=1 out/film.mp4
```

验收：

- [ ] 首帧对应歌曲 `-preroll` 秒，`comment=mv_start=...` 正确；
- [ ] 音画同步：在 3 个位置抽查（第一拍、副歌、最后一句）；
- [ ] 闪光预算通过；
- [ ] 时长 = preroll + 歌曲时长（或明确裁切）；
- [ ] 色彩为 BT.709，播放器不偏色；
- [ ] 同一命令重跑，哈希一致（或记录环境差异）。

发布包建议：

```
release/
├─ film-1080p.mp4
├─ poster.png
├─ STORYBOARD.md
├─ CREDITS.md
└─ QC.md
```

---

## 9. 不同 Agent 的适配

| 能力 | DSH | Codex | Claude Code | 通用 |
|---|---|---|---|---|
| 执行命令 | ✅ | ✅ | ✅ | 需要 shell |
| 浏览器自动化 | ✅（Playwright 脚本） | ✅ | ✅ | 需要 Chrome |
| 读图 | ✅（多模态） | ✅ | ✅ | V 角色必需 |
| 生图 | 通过 GPT 工具 | 通过图片工具 | 通过外部 | 也可用本地/API |
| 长任务 | 后台 job | 终端 | 终端 | 建议 nohup |

适配原则：

1. **不用 Agent 专属 API 写进引擎**。引擎只依赖 Node + FFmpeg + Chrome。
2. **生图与评审走"文件交接"**：V 输出 PNG 到 `assets/inbox/`，C 验收后移入 `assets/figures/`。
3. **所有提示词放仓库**（`docs/PROMPTS.md`），不放在聊天记录里。
4. **一次只改一个变量**：换风格、换歌、换字体分开做，否则无法归因。

---

## 10. 文件契约

| 文件 | 谁写 | 谁读 | 是否可手改 |
|---|---|---|---|
| `project.yaml` | 人 / C | 编译器 | ✅ 唯一源 |
| `lyrics.lrc` | 人 | 编译器 | ✅ |
| `analysis.json` | `analyze` | 编译器 | ❌ 重新测量 |
| `plan.json` | `build` | 渲染器 | ❌ |
| `STORYBOARD.md` | `build` | 人 / V | ❌ |
| `assets/figures/*.png` | V | 引擎 | ✅ 替换 |
| `out/*.mp4` | `render` | 人 | ❌ |

---

## 11. 时间与成本

以 30 秒、1080p30 的 Plate 片为例（本机实测）：

| 阶段 | 时间 | 说明 |
|---|---|---|
| analyze | < 5 s | 29 秒音频 |
| build | < 1 s | 11 个镜头 |
| still/sheet | 3–10 s/张 | 启动浏览器占大头 |
| render | 约 1–3 分钟 | 1001 帧，取决于机器与后期 |
| QC | < 1 分钟 | 接触表 + 闪光统计 |

Agent 的时间应该花在**分镜与验收**，而不是等渲染。渲染放后台，前台继续写下一段。

---

## 12. 一句话

**让 Code Agent 负责"可验证的正确"，让 Vision Agent 负责"可描述的审美"，中间用文件和时间码交接。**
