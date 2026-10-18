# 教程：从零做一支 Agent MV

> 以 Windows + PowerShell 为例；macOS/Linux 命令相同，路径换成 `/`。
> 全程不需要剪辑软件，不需要手动导帧。

---

## 0. 环境准备

| 依赖 | 版本 | 检查 |
|---|---|---|
| Node.js | ≥ 20（建议 22/24） | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| FFmpeg | ≥ 6（需 libx264） | `ffmpeg -version` |
| Chrome / Edge | 任意近期版本 | 由 Playwright 探测 |

```bash
git clone <repo> agent-mv-studio
cd agent-mv-studio
pnpm install
pnpm run build
node dist/cli.js doctor
```

`doctor` 应输出类似：

```
✓ node 24.19.0
✓ ffmpeg 9.0.2
✓ browser C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
✓ fonts inter, jetbrains-mono, source-serif-4
✓ styles plate, tui
```

缺 FFmpeg：Windows 用 `winget install Gyan.FFmpeg`；macOS `brew install ffmpeg`；Linux `apt install ffmpeg`。
缺浏览器：`npx playwright install chromium`，或设置 `AGENT_MV_CHROME` 指向 Chrome/Edge 可执行文件。

---

## 1. 新建项目

```bash
node dist/cli.js init my-mv --style plate
```

生成：

```
my-mv/
├─ project.yaml
├─ lyrics.lrc
├─ README.md
└─ assets/figures/
```

把 `song.wav` 拷进 `my-mv/`，把歌词写进 `my-mv/lyrics.lrc`。

LRC 最小格式：

```lrc
[00:12.34]第一句歌词
[00:16.80]第二句歌词
```

支持增强词标签：

```lrc
[00:12.34]<00:12.34>第<00:12.80>一<00:13.10>句
```

---

## 2. 写 project.yaml

最小可用版本：

```yaml
meta:
  title: my first agent mv
  style: plate
  width: 1920
  height: 1080
  fps: 30
  seed: 7

song:
  audio: song.wav
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
        moment: 系统先警告有闪光
      - at: { line: 1 }
        until: { line: 2 }
        scene: interface
        moment: 对话开始，世界只有一个窗口
        lines: [1]
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `meta.style` | ✅ | `plate` 或 `tui` |
| `meta.fps` | | 默认 plate 30 / tui 24 |
| `song.preroll` | | 静默片头秒数，默认 4 |
| `song.bpm/firstBeat` | | `auto` 用测量值；也可写死数字 |
| `shots[].at/until` | ✅ | `{bar,beat}` / `{beat}` / `{time}` / `{line}` / `{word}` |
| `shots[].scene` | ✅ | 已注册的场景名 |
| `shots[].moment` | ✅ | 一句话叙事说明 |
| `shots[].palette` | | 状态名 |
| `shots[].lines` | | 绑定的歌词行 id（从 1 开始） |
| `shots[].params` | | 场景参数 |

> 不要写裸秒数。`{time: -4}` 是片头这种"绝对时间"的例外；
> 其他镜头一律用 `{bar/beat}` 或 `{line}`，让编译器替你算。

---

## 3. 测量歌曲

```bash
node dist/cli.js analyze my-mv --force
```

输出：

```
✓ bpm 98.00 · first beat 0.604s · confidence 100%
  48 beats · 25 onsets · 29.39s
```

`analysis.json` 里能看到：

- `beatTimes`：每一拍的实际时间；
- `downbeats`：小节第一拍；
- `onsets`：强起音；
- `envelope`：低/中/高频能量，可用于驱动画面。

### 如果 BPM 错了

1. 先确认是不是半速/倍速（98 被听成 49 或 196）；
2. 在 `project.yaml` 写死：

```yaml
song:
  bpm: 98
  firstBeat: 0.604
```

3. 再跑一次 `analyze --force` 会覆盖手写值——手写值在 `build` 时优先，`analysis.json` 只提供 `beatTimes`。

### 如果第一拍不对

`firstBeat` 是第一个**可听**拍。如果歌有静默前奏，它可能晚于 0；
不要手动改成 0，否则整片会提前半拍。

---

## 4. 编译分镜

```bash
node dist/cli.js build my-mv
```

输出：

```
✓ 11 shots · 1920x1080@30 · 29.39s
  plan.json + STORYBOARD.md written to .../my-mv
```

打开 `STORYBOARD.md`，逐行检查：

- 时间是否连续（没有空洞/重叠）；
- `moment` 是否一句话说清；
- `palette` 是否符合世界圣经；
- 有没有 `initial` 时间需要替换。

`build` 常见错误：

| 错误 | 原因 | 修复 |
|---|---|---|
| `unknown scene` | 场景名拼错或风格里没有 | 对照 `STYLE_*.md` 的场景表 |
| `unknown lyric line` | `lines` 引用了不存在的行 | 看 `lyrics.lrc`，行号从 1 开始 |
| `missing moment` | 镜头没写 moment | 补一句叙事说明 |
| `shot ends before it starts` | `until` 早于 `at` | 检查引用 |
| `overlap` | 两个镜头时间重叠 | 调整 `until` 或删镜头 |

---

## 5. 预览

```bash
node dist/cli.js preview my-mv
```

浏览器打开后：

- 音频是时钟：按空格播放/暂停；
- `←` / `→` 跳 5 秒；
- `D` 显示调试 HUD（时间、镜头、ms/frame）；
- 页面底部显示当前歌词与拍号。

预览不写文件，改 `project.yaml` 后刷新即可（改了场景代码需要 `pnpm run build` 再刷新）。

---

## 6. 静帧与接触表

```bash
node dist/cli.js still my-mv --t 8.4 --out out/frame-8.4.png
node dist/cli.js sheet my-mv --times 0,4,8,12,16,20,24,28 --cols 4 --out out/sheet.png
node dist/cli.js strip my-mv --t 19.6 --out out/strip.png
```

看什么：

- **still**：构图、字号、对比度、剪影边缘；
- **sheet**：段落节奏、颜色曲线、有没有重复镜头；
- **strip**：切点前后的运动是否连续（15 帧，12 fps）。

---

## 7. 渲染

```bash
node dist/cli.js render my-mv --out out/film.mp4
```

默认：

- 从 `-preroll` 开始，到歌曲结束；
- H.264 / CRF 16 / yuv420p / BT.709；
- 音频 AAC 256k，自动加 `adelay` 对齐片头；
- 元数据 `comment=mv_start=<起始秒>`。

常用参数：

```bash
--start 12 --end 30      # 只渲染一段
--width 1280 --height 720
--fps 24
--crf 18
--no-post                # 关闭 WebGL 后期（排错用）
--headed                 # 显示浏览器窗口（排错用）
```

渲染是逐帧的，速度取决于机器与分辨率。1080p30 的 30 秒片通常 1–4 分钟。

---

## 8. 验收

```bash
node tools/qc.mjs flash out/film.mp4
node dist/cli.js check my-mv --t 8.4
ffprobe -v error -show_entries format_tags=comment -of default=nw=1 out/film.mp4
```

- `flash`：统计大面积亮度往返，>3 次/秒会报警；
- `check`：同一帧渲染两次，比较哈希；
- `ffprobe`：确认 `mv_start` 与首帧对齐。

更多见 [`QC.md`](QC.md)。

---

## 9. 排错

### 9.1 浏览器启动失败

```
Error: no Chrome/Edge found
```

- 设置 `AGENT_MV_CHROME` 为浏览器可执行文件绝对路径；
- 或 `npx playwright install chromium`。

### 9.2 渲染卡住 / 输出 0 字节

先跑 1 秒：

```bash
node dist/cli.js render my-mv --out out/probe.mp4 --start 0 --end 1 --headed
```

看浏览器控制台与 FFmpeg 输出。常见原因：

- FFmpeg 不在 PATH（`ffmpeg -version` 检查）；
- 音频文件路径错（`song.audio` 相对于项目目录）；
- `--no-post` 排查 WebGL 不可用。

### 9.3 画面全黑

- 场景 `boot` 只在 `t < 0` 绘制；`t ≥ 0` 会返回空帧；
- 检查 `at/until` 是否覆盖了当前 `t`；
- 用 `preview` 的 HUD 看当前镜头 id。

### 9.4 字体不对/回退

`doctor` 里字体应为 `ok`。若缺失：

```bash
pnpm install
```

字体通过 `@fontsource/*` 本地提供，不依赖系统字体。不要改成 `Arial`，否则排版会全变。

### 9.5 颜色发灰/发暗

- Plate 的 `vignette=0.3` 是刻意的；TUI 是 `0.08`；
- 检查 `post` 参数是否被风格覆盖；
- 渲染输出是 BT.709；如果播放器按 BT.601 解，会偏色（用 `ffprobe` 确认 tags）。

### 9.6 音频对不上

- `mv_start` 应等于 `-preroll`（默认 `-4`）；
- `adelay` 由 `render` 自动加，不要手动再 delay；
- 若从中间渲染（`--start 12`），音频会 `-ss 12`，首帧对应 12 秒。

### 9.7 改 YAML 不生效

`render` 读 `plan.json`，不读 YAML。改完必须：

```bash
node dist/cli.js build my-mv
```

---

## 10. 发布

```bash
mkdir release
copy out\film.mp4 release\film-1080p.mp4
copy my-mv\STORYBOARD.md release\
copy CREDITS.md release\
```

建议同时导出：

- 一张海报（挑全片最亮、最干净的 still）；
- 一张接触表（证明结构）；
- `QC.md`（证明验收）。

公开传播前，再次确认歌曲/歌词/素材授权。
