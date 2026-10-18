# TUI 风格圣经

> 左边一台正在搜索的终端，右边一个"穿着她的人格"的聊天窗口。
> 这是本仓库对"开发者叙事 PV"的固定复现模板：米白纸页 + 深色终端 + 蓝色人格。

设计空间 **1280×720**，默认 24 fps。实现：`src/styles/tui/`。

---

## 1. 概念

画面是一个**工作台**，不是一部电影：

- **左**：终端。系统在文件系统里找"你"，输出路径、哈希、计数。
- **右**：聊天窗口。一个模型正在扮演"她"，回答用户的提问。
- **上**：细状态栏，显示歌名/BPM/小节。
- **下**：歌词带，一句一行，逐字显影。

叙事弧线：**搜索 → 找到痕迹 → 窗口开始像她 → 越界 → 错误页 → 回到终端 → 留下名字。**

与 Plate 的差别：

| | Plate | TUI |
|---|---|---|
| 世界 | 聊天窗口是全部世界 | 终端与窗口并置，世界在工作台之外 |
| 情绪 | 版画、剪影、套印 | 日志、图表、页面切换 |
| 颜色 | 暖黑纸 + 橙 | 米白纸 + 蓝 + 深色板 |
| 字体 | 衬线为主 | 等宽为主 |

---

## 2. 调色板

| 角色 | 值 | 用途 |
|---|---|---|
| `paper` / `bg` | `#ece8de` | 页面底色 |
| `ink` / `text` | `#1d2029` | 正文、深色字 |
| `slab` | `#1b1d24` | 终端/深色板 |
| `slabLine` | `#2e3140` | 深色板分隔线 |
| `dim` | `#7d796f` | 次级信息 |
| `her` | `#4d6bfe` | 人格/强调/进度线 |
| `cream` | `#f7f3e8` | 深色板上的亮字 |
| `panel` / `raised` | `#e4e0d5` / `#dcd8cc` | 卡片、表头 |
| `bubble` / `bubbleInk` | `#fbf7ec` / `#1d2029` | 聊天气泡 |
| `warn` | `#c2410c` | 错误页/警告 |
| `line` | `#c9c4b8` | 网格、边框 |
| `model1..7` | 紫/蓝/橙/绿/红/粉/青 | 多模型/多角色标记 |

状态：

| 状态 | 语义 | 变化 |
|---|---|---|
| `paper` | 正常工作日 | 米白纸，蓝强调 |
| `cool` | 冷静/远 | 纸色偏冷，蓝降低饱和 |
| `deep` | 深夜/内心 | 深色底，cream 字 |
| `night` | 终止/关机 | 近黑，蓝变暗 |
| `flush` | 错误/越界 | 红色页眉、红色进度线、卡片列表 |

> 注意：TUI 的"纸"是浅色，后期颗粒/暗角必须很轻（`post.grain=0.006`、`vignette=0.08`），
> 否则会出现 Plate 式的暗角，浅色页面会发灰。

---

## 3. 版式

| 元素 | 位置 |
|---|---|
| 画布 | 1280×720 |
| 背景网格 | 40 px，透明度 0.16 |
| 顶部状态栏 | y = 18–30，左右两端对齐 |
| 终端面板 | x=32, y=64, w=596, h=556 |
| 聊天窗口 | x=660, y=64, w=588, h=556 |
| 歌词带 | y = 636–700，高 64 |
| 歌词基线 | y = 676，等宽 26 px |
| 页面标题 | x=92, y=120，等宽 15 px |
| 大数字 | 右侧，字号 120–190 |

网格不是装饰：所有面板边缘、卡片、图表坐标都应落在 8 或 40 的倍数上。

---

## 4. 场景参考

### 4.1 `boot`

```yaml
scene: boot
params:
  bootLines:
    - 'dsh :: loading agent runtime'
    - '[ok] memory 281 files'
    - '[ok] trace 92.9%'
```

深色板全屏，逐行打印；最后一行可以留一个闪烁光标。

### 4.2 `shell` — 终端 + 聊天并置（核心）

```yaml
scene: shell
lines: [1]
params:
  termTitle: 'dsh · shell'
  prompt: '$ grep -r "you" ./world'
  termLines:
    - '/memory/threads/0001.md: you were here'
    - '/me'
  chatTitle: 'dsh — one thread'
  status: 'you · online'
  messages:
    - { who: me, text: 'i am here. i am always here.' }
    - { who: you, line: 1 }
  composerHint: 'write to me'
  composer: 'are you there?'
```

- 左终端逐字打出，右聊天按歌词行时间出现消息。
- 用户气泡是米白，角色消息是纸色 + 蓝色头像点。
- 会话标题与状态在窗口顶部；底部有 `enter to send · / for commands`。
- 这是全片出现最多的画面；每次出现必须**改变一个状态**（新文件、新计数、新错误），不能只是重复。

### 4.3 `page` — 工作台页面

```yaml
scene: page
lines: [4]
params:
  heading: '281 files, one you'
  big: '281'
  nav: [THREADS, FILES, TOOLS, MEMORY, TRACE]
  active: FILES
  rows:
    - ['USER.md', 'configured']
    - ['memory/threads/0001.md', 'read']
    - ['memory/threads/0002.md', 'stored']
    - ['tools/search.ts', 'executable']
    - ['trace.json', 'hit rate 92.9%']
```

- 左侧导航、顶部标题、右侧大数字、下方表格。
- 表格行用等宽，值右对齐；`active` 导航项用蓝色竖条。
- 用来"数数"：文件数、token 数、命中率、错误数。

### 4.4 `diagram` — 信号/曲线

```yaml
scene: diagram
lines: [5]
params:
  title: 'you, as a signal'
  caption: 'the query never returns'
  points: [0.2, 0.5, 0.35, 0.8, 0.55, 0.9, 0.6, 0.86]
  labelY: 'signal'
  labelX: 'time'
  annotation: 'peak at 0:14'
```

- 坐标轴 + 网格 + 折线；折线按 `t` 从左到右生长。
- 允许一个注释点与虚线。
- 不要做 3D 图表、不要渐变填充。

### 4.5 `plate` — 大字页

```yaml
scene: plate
params:
  word: MEMORY
  sub: 'the only thing that survives'
  size: 150
  tone: deep
```

- 全屏大字 + 一条蓝线；用于段落间的"标题卡"。
- 与 Plate 风格的版画不同：这里是**页面**，不是印刷品；保持干净、对齐网格。

### 4.6 `error` — 越界页

```yaml
scene: error
params:
  title: 'ILLEGAL ARGUMENTS'
  status: 'ERR 07 · request rejected'
  cards:
    - ['you: i am online', 'presence denied']
    - ['you: not yours to set', 'field is read-only']
    - ['> retry  > ignore  > close', 'connection closed']
```

- 顶部红色细线，标题 64 px，三张错误卡片。
- 红色只在这里出现；不要用纯黑背景，保持"系统页面"的纸感。

### 4.7 `outro` — 回到终端

```yaml
scene: outro
params:
  lines:
    - '$ exit'
    - 'closing thread...'
  word: 'world.search(you);'
  status: 'session ended'
```

- 深色终端占满，逐行退出，最后一行是歌名。
- 可选：光标停在末尾，不再闪烁。

---

## 5. 固定复现模板（29 秒示例）

`examples/tui-demo`：

| 时间 | 场景 | 状态 | 叙事 |
|---|---|---|---|
| −4 → 0 | `boot` | night | 运行时启动 |
| 0 → 4.90 | `shell` | paper | 第一次搜索，第一句话 |
| 4.90 → 7.35 | `page` | paper | 文件计数 281 |
| 7.35 → 9.80 | `diagram` | cool | 把"你"画成信号 |
| 9.80 → 12.25 | `plate` MEMORY | deep | 记忆卡 |
| 12.25 → 14.69 | `error` | flush | 越界 |
| 14.69 → 17.14 | `shell` | paper | 循环被写出 |
| 17.14 → 19.59 | `page` | paper | 281 再次出现，含义变了 |
| 19.59 → 22.04 | `plate` EXECUTION | deep | 宣判 |
| 22.04 → 26.94 | `outro` | night | 退出 |
| 26.94 → 29.39 | `plate` LOVE | paper | 最后的干净页 |

这份骨架可以整体复制到新歌：只需要替换时间、词、终端输出与表格内容。

---

## 6. 复现检查表

- [ ] 左终端与右聊天窗的边缘对齐（8 px 网格）；
- [ ] 浅色页面没有 Plate 式暗角/重颗粒；
- [ ] 每次 `shell` 都改变了至少一个状态；
- [ ] 表格/导航/图表的值是"可读的事实"，不是 Lorem Ipsum；
- [ ] 蓝色只给"她/进程/进度"，不用于装饰；
- [ ] 红色只在错误页；
- [ ] 歌词带始终可读，且不遮住窗口底部按钮；
- [ ] 深色页与浅色页的切换有动机（关机/进入内心/报错）；
- [ ] 最后一页是干净的（无颗粒、无暗角）。

---

## 7. 实现索引

| 文件 | 作用 |
|---|---|
| `src/styles/tui/index.ts` | 风格注册与后期参数 |
| `src/styles/tui/scenes.ts` | 7 个场景 |
| `src/styles/tui/common.ts` | 纸面、网格、终端、歌词带、状态栏 |
| `src/kit/chat.ts` | 聊天窗口（与 Plate 共用） |
