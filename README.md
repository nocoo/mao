# 山河诗卷 · 毛主席诗词鉴赏

以 1966—1975 年宣传画的红星、红旗与暖色手绘质感为视觉参考的全屏数字阅览室。左侧是 GPT Image 生成的红星山河画面，右侧是可独立滚动的诗页；标题退为小号标识，切换和鉴赏按钮保持可见。Vite 构建，原生 JavaScript、CSS 与浏览器动画；没有生产环境框架依赖或后端。

## 启动

需要 Node.js 20.19+ 或 22.12+ 及 pnpm。

```bash
pnpm install
pnpm dev
```

打开 <http://127.0.0.1:4173>。Vite 使用固定端口；如果端口已被占用，会明确报错，不会悄悄换地址。

```bash
pnpm build         # 转换 Markdown，再构建静态站点
pnpm preview       # 预览生产构建；与 dev 互斥使用 4173 端口
pnpm test          # 数据、正文边界、注释和原始版本校验
pnpm test:browser  # 先 build；启动临时 Vite preview 4175，执行浏览器交互检查
pnpm test:fullscreen # 临时 preview 4176，检查六种视口、长诗滚动、凭据隔离
```

浏览器测试默认使用 macOS 已安装的 Google Chrome；其他系统可设置 `CHROME_PATH`，或运行 `pnpm exec playwright install chromium`。测试结束后自动关闭临时服务器。

## 阅读方式

- 首页从全卷 **100 条资料**中随机选读；随机袋一轮内不重复。
- 目录依原索引保留编号，支持题目、年份与诗句搜索，及正编 / 副编 / 补编筛选。
- 「展卷细读」按需打开注释、题解、赏析、版本与备注，首页不展示解释性材料。
- 原始版本单独折叠；没有注释的作品会明确提示，不自动编写鉴赏。
- 支持 `←` / `→` 翻页、`R` 随机、`/` 打开目录、`Esc` 关闭面板。
- 每篇有可分享链接，如 <http://127.0.0.1:4173/#poem=19>；支持浏览器前进与后退。
- 尊重系统「减少动态效果」，不支持 View Transitions 时降级为普通动画。

## 资料与生成

[Markdown 索引](<data/诗词/index.md>)是编目来源；[转换器](<scripts/build-data.mjs>)优先采用文档中的阅读正文，分离诗前说明、注释、题解、赏析和两份原始条目。

修改资料后运行 `pnpm build:data`，或重新运行 `pnpm dev` / `pnpm build`。生成数据在 [poems.js](<assets/poems.js>)；请修改原始 Markdown，不要手动改生成文件。构建不会改写原始资料。

主目 67 首，补编 33 条；收录、版本与校勘情况见[校勘记录](<data/诗词/校勘记录.md>)。屏幕只规范部分英文标点和短行拼接，保留诗句文字；原始排版在版本资料中可查。

## 视觉与技术

- 全视口分栏；朱红、暖金、军绿与纸色，小号题字、宋体正文、印章式编次。
- [红星山河主视觉](<assets/generated/red-star.webp>)由 GPT Image Sunburst 生成；[原始 PNG](<assets/generated/red-star-original.png>)保持不变，网页使用 WebP。
- [历史参考、提示词与生成记录](<design/visual-direction.md>)可查；生成画面不是历史宣传画原件，旧矢量插画已不再显示。
- Vite 8、CSS Cascade Layers、响应式 Grid、原生 Dialog、View Transitions 与 Web Animations。
- 字体全部自托管，正常阅读无需访问第三方 CDN；[字体说明及许可](<assets/fonts/README.md>)随项目保留，构建也包含两份 OFL。
- 所有文本通过 DOM 文本节点展示；注释仅渲染有限 Markdown，不将资料作为 HTML 执行。

设计过程参考 Damir Sokolovsky（[@heydamir](https://x.com/heydamir)）的 Unslop 方法，CC BY 4.0。主视觉按本项目提示词生成，图像 API 仅在本地制作阶段调用；私密配置不进入前端，阅读时不调用图片服务。

## 部署与边界

`pnpm build` 产出静态目录 `dist/`，可部署到静态托管服务。相对资源路径支持子目录部署；原始资料一起复制，页面中的「原始文档」链接也可用。

本次浏览器验收使用 Chromium：15 项数据校验、12 组交互检查，以及 1440×900、1920×1080、1024×768、390×844、320×740、800×450 六种全屏视口检查，包含长诗内部滚动、固定操作区与凭据隔离。未做 Safari / Firefox 真机验收；没有新增史料校勘，也没有添加账号、云同步或分析追踪。
