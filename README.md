# DeepRead — 项目进度记录

这是一个可以直接在 VSCode 里打开的 **Chrome Manifest V3 扩展**项目。

当前是一个可运行的早期原型：工具栏 popup 向 content script 发消息，在页面右侧注入一个 Reading Guide 侧边栏，侧边栏会对当前网页做**本地正文提取、关键信息统计和摘要草稿**。整个过程在浏览器内完成，没有任何数据外发。

## 当前已实现

1. MV3 扩展骨架：popup → content script 消息通信，面板注入 / 移除。
2. 双模式文本提取：
   - **文章模式**：接入 `@mozilla/readability`（`vendor/readability.js`，无构建步骤），提取文章标题、作者、站点名；
   - **整页模式**：Readability 认不出的页面自动退回，剥离导航/脚本等页面骨架后抓取全部可见文本。
3. 阅读统计：字数（中英文兼容）、预估阅读时长、段落数；面板上会标注当前用的是哪种提取模式。
4. 本地抽取式摘要草稿：按词频给句子打分，选出最多 3 个关键句作为要点列表（纯前端启发式，非 LLM）；短内容页面也能出结果。
5. 失败兜底：页面上几乎没有文字时提示"无可读文本"，不会崩溃。

## 尚未实现（后续计划）

- LLM 生成的三段式导读与摘要
- 论证结构树（点击节点跳转原文段落）
- 划词白话解释
- 争议点标注

## 文件说明

| 文件 | 作用 |
|---|---|
| `manifest.json` | MV3 配置；content script 先加载 `vendor/readability.js` 再加载 `content.js`。 |
| `popup.html`, `popup.css`, `popup.js` | 工具栏菜单，发送"打开 Reading Guide"消息。 |
| `background.js` | 最小 service worker，确认安装。 |
| `vendor/readability.js` | Mozilla Readability 库的浏览器版本。 |
| `content.js`, `content.css` | 正文提取 + 摘要 + 注入/移除 Reading Guide 面板。 |

## 在 Chrome 里运行

1. 用 VSCode 打开本文件夹。
2. 打开 Chrome，访问 `chrome://extensions`。
3. 右上角开启**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择整个文件夹。
5. 打开一个普通的 `http` / `https` 文章页面（不要用 `chrome://` 或应用商店页面）。
6. 点击 DeepRead 图标，选择 **Open Reading Guide**。

## 下一步

把提取到的正文文本交给 LLM，替换当前的抽取式摘要为生成式导读；然后基于标题层级做论证树的雏形。
