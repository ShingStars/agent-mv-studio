# Credits

## 本项目

- 引擎、编译器、两套风格场景、示例分镜、文档：本项目作者（MIT）。
- 示例音乐：`tools/synth-demo.mjs` 程序化合成，随仓库以 MIT 分发。
- 示例歌词：本项目原创，随仓库以 MIT 分发。
- 示例剪影：由视觉 Agent（GPT Image）按本项目提示词生成，随仓库以 MIT 分发。

## 参考作品

本项目的方法论来自对以下两支公开作品的**分析与语法提炼**。仓库中不包含它们的
代码、画面、剪影、字体、歌曲或歌词文件；两套风格是独立重写的实现。

1. **world.execute(me); 歌词影像** — Nyankomintsu
   - 形式：浏览器 Canvas2D/WebGL2 逐帧渲染，4K60。
   - 参考点：界面/版画/代码三种画面、三色油墨、无脸剪影、拍网格切点、
     `cues.js` 单点时间表、闪光预算。
   - 其仓库声明：代码 MIT；角色剪影 CC BY-NC-SA 4.0；歌曲与歌词版权归 Mili，
     不随仓库分发。

2. **world.search(you); DSH PV** — MisakaZentai
   - 形式：Pillow 终端 + Playwright 页面截图 + FFmpeg 合成，720p24。
   - 参考点：左终端/右聊天窗的双通道叙事、逐帧页面状态、词级时间、
     浅色纸张与深色终端并置、片尾字幕。
   - 其仓库声明：代码 MIT；美术 CC BY-NC-SA；歌曲、歌词、字体与成片不分发。

## 字体

- Inter — SIL Open Font License 1.1
- Source Serif 4 — SIL Open Font License 1.1
- JetBrains Mono — SIL Open Font License 1.1

字体通过 `@fontsource` 包引入，版本由 `pnpm-lock.yaml` 锁定。

## 工具

- Playwright（Apache-2.0）— 无头浏览器驱动
- FFmpeg（LGPL/GPL，按构建而定）— 编码与合成
- Node.js / TypeScript — 运行时与类型系统

## 致谢

感谢两支参考片的作者把"逐帧可复现的 MV"变成可学习的方法。
也感谢所有把渲染管线、时间对齐、字体授权写清楚的工程文档作者——
本项目大量受益于这些"不性感但救命"的细节。
