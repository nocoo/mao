<h1 align="center">山河诗卷 · Mao Poetry Room</h1>
<p align="center">纸本风格的毛泽东诗词数字阅览室，提供目录检索、矩阵视图、校勘解析与配乐朗诵播放。</p>
<p align="center"><a href="https://mao.hexly.ai">站点</a> · <a href="docs/README.en.md">English</a></p>

## 这是什么

`山河诗卷`（`shanhe-poetry-room`）是一座基于 Vite、原生 ES 模块与 CSS 构建的静态红纸风格数字阅览室，部署在 Cloudflare Workers（[mao.hexly.ai](https://mao.hexly.ai)），并通过 Cloudflare R2 CDN 分发音频与插图资源。

全站无前端框架或数据库依赖。`audio/` 下收录 96 篇条目的本地 MP3（1 首参考录音与 95 首基于 Fish Audio Drama 3 合成的朗诵，非历史广播），所有录音仍需人工试听复核；本仓库仅包含源码与构建流程，本地提交不代表媒体上传或线上发布授权。

## 功能

- **96 篇诗词档案**：涵盖正编 39 篇、副编 24 篇、补编 33 篇，保留三组联章诗原始分组，区分律诗、双调词、单调词、古体、残句等体裁标注，并提供校勘注释、创作背景、赏析与押韵标色。
- **多模式阅读与导航**：支持按标题、年份、编号或诗句检索，支持矩阵总览、横/竖排切换、亮/暗主题与 `prefers-reduced-motion` 无障碍模式。
- **CDN 音频播放与快捷键**：支持播放/暂停、进度跳转、倍速与上下篇切换（未做逐字逐句时间轴同步），提供 `Space`、`←`/`→`、`↑`/`↓`、`/`、`L`、`M`、`T`、`V`、`N`、`Esc` 快捷键。
- **健康检查端点**：`GET /api/live` 返回构建期生成的 JSON 状态与版本号（`Cache-Control: no-store`）。

## 使用

在线访问：[mao.hexly.ai](https://mao.hexly.ai)。

本地预览构建产物：

```sh
pnpm install --frozen-lockfile
pnpm run build            # 生成 assets/poems.js 并构建 dist/
pnpm run preview          # 在 127.0.0.1:7065 预览 dist/
```

## 开发

需要 Node.js 22.13+ 与 pnpm（`pnpm@11.28.5`；CI 使用 Node `26.12.1`）。编辑诗词与解析请修改 [`data/诗词/index.md`](data/诗词/index.md)、[`data/analysis/`](data/analysis/)、[`data/illustrations.json`](data/illustrations.json) 与 [`audio/manifest.json`](audio/manifest.json)，切勿直接手改自动生成的 [`assets/poems.js`](assets/poems.js)。

```sh
pnpm run build:data       # 重新生成 assets/poems.js
pnpm run dev              # 启动本地 Vite 开发服务器（127.0.0.1:7065）
pnpm run deploy:check     # Wrangler 本地 dry-run（不实际部署）
pnpm run verify:production # 只读检查线上站点与 CDN 字节范围
```

## 测试

Worker 与浏览器测试需先执行 `pnpm run build` 生成 `dist/`，并使用隔离的本地 CDN fixture，不会向远端 R2 上传或发布。

```sh
pnpm run test             # 运行数据、ViewModel、播放器与部署脚本测试
pnpm run test:coverage    # Node 单元测试与 coverage/lcov.info
pnpm run test:worker      # 隔离本地 Worker 与 HTTP 检查
pnpm run test:browser     # :4175 端口 Chromium 交互测试
pnpm run test:fullscreen  # :4176 端口桌面端全屏与竖排布局检查
```

## 技术栈

- **前端与视图**：原生 JavaScript（ES Modules）、CSS（[`app.js`](app.js)、[`src/view-model.js`](src/view-model.js)、[`src/media.js`](src/media.js)、[`src/player.js`](src/player.js)）
- **构建与数据管线**：Vite、Node.js 构建脚本（[`scripts/build-data.mjs`](scripts/build-data.mjs)）
- **部署与存储**：Cloudflare Workers（Wrangler）、Cloudflare R2 CDN
- **测试与质量**：Node Test Runner、Playwright、GitHub Actions（[CI](.github/workflows/ci.yml)、[Release](.github/workflows/release.yml)）

## 文档

- [项目契约](AGENTS.md)
- [音频说明](audio/README.md) · [校勘记录](data/诗词/校勘记录.md)
- [更新日志](CHANGELOG.md) · [复盘记录](Retrospective.md)
- [朗诵生成技能](skills/mao-poetry-recitation/SKILL.md)

## 许可证

本仓库未附带独立的根目录 `LICENSE` 文件。内置字体、参考文献及音频素材各自遵循其原始来源声明。
