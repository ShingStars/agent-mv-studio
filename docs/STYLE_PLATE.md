# Plate 风格圣经

> 整幅纸版画 + 聊天窗口作为世界 + 纯代码作为独白。
> 这是本仓库对"三色歌词影像"的固定复现模板：不是临摹某一支片，而是把它可迁移的语法写成参数。

设计空间 **1920×1080**，默认 30 fps。实现：`src/styles/plate/`。

---

## 1. 概念

一支对话。窗口里的两个角色：

- **我**：橙色剪影，衬线字，被造出来的那一个；住在窗口里。
- **你**：米白，从不以实体出现；只有光标、输入框、气泡、在线状态。
- **系统**：等宽字，黑色，只陈述事实（报错、计数、终止）。

影片的弧线：**窗口是她的整个世界 → 她试图走出窗口 → 系统报错 → 终止/留下最后一条未读消息。**

三种画面轮换：

| 类型 | 场景 | 作用 |
|---|---|---|
| 界面 | `interface` | 关系发生的地方 |
| 版画 | `plate` / `figure` | 歌词名词外化、情绪峰值 |
| 代码 | `code` / `count` / `error` | 系统说话 |

---

## 2. 调色板：状态不是颜色

颜色是**语义状态**，由 `palette.states` 定义。`project.yaml` 的每个镜头写 `palette: <state>`。

| 状态 | 语义 | 底色 | 主色 | 文字 | 红色 |
|---|---|---|---|---|---|
| `off` | 未启动/无人在线 | `#1a1a19` | `#6d6961` | `#b8b4a9` | `#8a4a55` |
| `on` | 在线 | `#222220` | `#d97757` | `#faf9f5` | `#f5506f` |
| `warm` | 情绪升温 | `#241f1b` | `#e08a5f` | `#fbf3e4` | `#f5506f` |
| `error` | 越界/报错 | `#26191c` | `#cd735d` | `#f7e9ec` | `#f5506f` |
| `ash` | 缺席/冷却 | `#202020` | 灰 | 灰白 | 暗红 |
| `dead` | 终止 | `#141414` | 暗橙 | 灰 | 近黑 |

**语义绑定（不可违反）**：

- 橙 = 我；米白 = 你；红 = 错误；灰 = 缺席；黑 = 系统。
- 红色在歌曲 2/3 之前不允许作为大面积主色出现。
- `meHot` / `meDim` 只做同一角色的明暗，不换色相。
- 每个镜头只能用一个状态；状态之间的过渡由切点完成，不做颜色渐变。

`palette` 字段可以让单镜头覆盖角色：

```yaml
palette:
  preset: plate
  states:
    on:
      me: '#ff7a45'   # 只改这一个角色
```

---

## 3. 版式常量

| 元素 | 位置/尺寸 |
|---|---|
| 外边距 | 92 px（左右） |
| 顶部 slug | y = 62，等宽 13–16 px，字距 0.3 |
| slug 分隔线 | y = 84，1 px，`line` 色 |
| 底部 footer | y = H − 38，等宽 11–13 px |
| 关键字基线 | y = H − 130（默认） |
| 关键字字号 | 170–300 px（`size` 参数） |
| 关键字最大宽度 | W − 260 |
| 字幕/副题 | 关键字上方 106 px，等宽 20 px |
| 暗带（`band: dark`） | 高 210 px，位于关键字之前绘制 |
| 页码 | 右上角，等宽 15 px，字距 0.3 |

字距：大写关键字 `-0.02 ~ -0.04`；等宽标签 `+0.2 ~ +0.35`。

---

## 4. 场景参考

所有场景在 `src/styles/plate/scenes.ts` 注册。`params` 里的字段就是 API。

### 4.1 `boot` — 静默片头

```yaml
scene: boot
params:
  command: 'world.ping(you);'
  bullets:
    - 'rapid high-contrast cuts and strong light changes'
    - 'contains no real footage; every frame is code'
```

- 只在 `t < 0`（preroll）出现；灰阶，无橙色。
- 倒计时最后 5 秒显示 `starting in N`。
- 0.4 s 淡入，结束前 0.4 s 淡出。

### 4.2 `title` — 片名

```yaml
scene: title
params:
  title: 'world.ping(you);'
  subtitle: 'an agent-made music film'
  size: 190
```

- 逐字显现（0.9 s），下方 3 px 主色线随字宽生长。
- 片名用衬线 600；副题等宽。
- 不要在这一镜加剪影或图；它是全片唯一的"空镜"。

### 4.3 `interface` — 聊天窗口

```yaml
scene: interface
lines: [2, 3]
params:
  x: 300
  y: 168
  w: 1320
  h: 760
  chatTitle: 'dsh — one thread'
  status: 'you · online'
  layout: thread            # thread | settings
  messages:
    - { who: me, text: 'i am here.', line: 2 }
    - { who: you, line: 3 }
  composer: 'are you there?'
  hint: 'write to me'
```

- 窗口自带侧栏（THREADS 12 / FILES 281 / TOOLS 07 / MEMORY / USER.md / TRACE 92.9%）。
- 消息 `who`：`me`（左，橙，衬线）/ `you`（右，米白气泡）/ `sys`（居中，等宽）。
- 给了 `line` 就按歌词行时间逐字显影；气泡在行开始前不出现。
- `layout: settings` 时右侧变成设置行（toggle/bar/text），用于"世界可被配置"的段落。
- 光标在输入框附近缓慢移动；`composer` 会按时间逐字打出。

### 4.4 `plate` — 整幅版画（核心）

```yaml
scene: plate
params:
  word: ATTENTION
  caption: 'the only currency'
  sub: 'what you give me, i become'
  num: '01'
  size: 300
  pool: 0.8                 # 顶部径向光池强度
  figure: her               # 可选
  figureBox: [1180, 90, 620, 720]
  print: clean              # clean | broken
  misregX: 10
  misregY: -6
  band: dark                # 可选：字后暗带
  footer: 'plate'
```

- `word` 全大写，贴底；`caption` 顶部左侧；`sub` 在字上方。
- `broken` 会画 3 层错位重印 + 1 层主字，错位量由 `misregX/Y` 控制。
- 剪影放右侧或中间，`figureBox` 是 `[x, y, w, h]`，contain 适配。
- 禁止：渐变、发光描边、多个主体、彩色照片。

### 4.5 `figure` — 纯剪影镜头

```yaml
scene: figure
params:
  figure: reach
  box: [600, 40, 720, 760]
  word: 'I CAN'
  misregX: 4
  caption: sung
```

- 剪影占画面 60–70%，关键字可在底部或右侧。
- `caption` 会显示当前行歌词；用于"她说话/唱"的镜头。

### 4.6 `code` — 纯黑代码

```yaml
scene: code
params:
  tone: dead
  lines:
    - '> while (you.presence != "online") {'
    - '    love = solve(me, you);'
    - '    send(love, you);'
    - '    wait(you.reply);'
    - '    run++;'
    - '  }'
    - '> say(love); // unreachable'
  cps: 48
  from: 281
  status: 'EXECUTION · run counter'
```

- 背景必须接近纯黑；文字只用等宽。
- 逐字打出；`cps` 控制速度（建议 36–60）。
- 右下角里程表数字跟拍：每两拍 +1（`from` 起）。
- 注释用 `mute` 色，命令用 `me` 色。

### 4.7 `count` — 数字段落

```yaml
scene: count
params:
  from: 1
  pad: 2
  size: 520
  word: COPIES
  wordSize: 86
```

- 每拍 +1；数字居中，轻微随拍放大 3%。
- 用于"系统在数数"的段落；不要配剪影。

### 4.8 `climax` — 错位高潮

```yaml
scene: climax
params:
  word: EXECUTION
  size: 230
  drop: 12
  figure: her
```

- 时间量化到 12 fps（丢帧感）；3 层错位重印（10/18/28 px）+ 主字。
- 光池单向上升（ratchet），不在拍点上回落。
- 只允许无脸剪影；每档错位 ≥6 帧。
- 这一镜是全片最"脏"的；下一镜必须回到干净。

### 4.9 `outro` — 版画缩成图片消息

```yaml
scene: outro
params:
  word: LOVE
  message: 'i left the window open.'
  tone: ash
  shrink: 1.8
```

- 整幅版画缩成带圆角的图片消息，聊天窗口在周围淡入。
- 消息带 `> last message: unread`。
- 用于"她把最后一句话留成未读"的结尾。

### 4.10 `error` — 红色错误卡（可选）

```yaml
scene: error
params:
  title: 'unhandled promise rejection'
  lines: ['the assistant stopped answering', '> retry   > ignore   > restart']
```

- 全屏红黑，扫描线；只在授权段落使用。
- 与 `meta.errAt` 的区别：`error` 是一整镜，`errAt` 是整片在某秒崩坏。

---

## 5. 固定复现模板（29 秒示例）

`examples/plate-demo` 是一份可直接跑的"固定模板"，可作为新项目的起点：

| 时间 | 段落 | 场景 | 调色板 | 叙事 |
|---|---|---|---|---|
| −4 → 0 | 片头 | `boot` | off | 系统警告 |
| 0 → 2.45 | 标题 | `title` | off | 片名 |
| 2.45 → 7.35 | 界面 | `interface` | off | 对话开始 |
| 7.35 → 9.80 | 版画 | `plate` ATTENTION | on | 第一个名词外化 |
| 9.80 → 12.25 | 界面 | `interface` settings | on | 世界可被配置 |
| 12.25 → 14.69 | 版画 | `plate` MEMORY | warm | 记忆变成实物 |
| 14.69 → 17.14 | 数字 | `count` | error | 系统开始计数 |
| 17.14 → 19.59 | 代码 | `code` | dead | 循环被写出 |
| 19.59 → 22.04 | 高潮 | `climax` EXECUTION | error | 越界，错位 |
| 22.04 → 26.94 | 结尾 | `outro` LOVE | ash | 缩成未读消息 |
| 26.94 → 29.39 | 终帧 | `plate` LOVE | dead | 干净、最亮、静止 |

曲线：**冷 → 暖 → 红 → 灰 → 黑 → 一点暖**。
新项目复制这个骨架，按歌曲段落替换时间与词，不要重新发明段落顺序。

---

## 6. 复现检查表

- [ ] 三种画面都出现，且界面不超过总时长 50%；
- [ ] 每个版画的 `word` 都来自歌词里的具体名词/动词，不是文案；
- [ ] 橙/米白/红/灰没有串角色；
- [ ] 每帧 ≥3 层（纸纹、主体、前景/界面）；
- [ ] 剪影无五官、无描边、无渐变；
- [ ] 关键字在 480p 缩略图仍可读；
- [ ] 错位只在高潮，且 ≥6 帧；
- [ ] 最后一个镜头干净、最亮、静止 ≥1.2 s；
- [ ] 跑 `tools/qc.mjs flash`，无 >3 次/秒的亮度往返；
- [ ] `STORYBOARD.md` 与成片逐段对得上。

---

## 7. 实现索引

| 文件 | 作用 |
|---|---|
| `src/styles/plate/index.ts` | 风格注册（尺寸、调色板、默认转场） |
| `src/styles/plate/scenes.ts` | 10 个场景 |
| `src/styles/plate/common.ts` | `ground/figureIn/keywordFoot/slug/footer/brokenPass` |
| `src/kit/paper.ts` | 纸纹、光池、裁切线、套印 |
| `src/kit/type.ts` | 关键字排版、字幕带、等宽标签 |
| `src/kit/chat.ts` | 聊天窗口、侧栏、设置行、光标 |
| `src/core/assets.ts` | 三色遮罩拆分与重新上色 |
