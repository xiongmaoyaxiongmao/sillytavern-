# Chat Search Jump for SillyTavern

搜索当前 SillyTavern 聊天记录里的关键词，并点击结果跳转到对应楼层。

## 功能

- 浮动放大镜按钮打开搜索面板。
- 搜索当前聊天的全部 `chat` 数组，不只搜索当前屏幕上已渲染的消息。
- 点击结果会滚动到对应 `.mes[mesid="..."]`。
- 如果目标楼层还没渲染，会自动点击 `#show_more_messages` 加载旧楼层后再跳转。
- 支持区分大小写、搜索角色名、包含/排除隐藏消息。
- 快捷键：`Ctrl+Shift+F` 打开/关闭，`Ctrl+G` 下一个，`Ctrl+Shift+G` 上一个，`Esc` 关闭。

## 安装

把整个 `sillytavern-chat-search-jump` 文件夹复制到 SillyTavern 的扩展目录之一：

- 全局安装：`public/scripts/extensions/third-party/sillytavern-chat-search-jump`
- 用户安装：`data/<user-handle>/extensions/sillytavern-chat-search-jump`

然后刷新 SillyTavern 页面，在聊天界面右下角点击放大镜。

## JS-Slash-Runner / Tavern Helper

这个扩展不强制依赖 JS-Slash-Runner。若页面中已经有 Tavern Helper 并暴露 `getChatMessages`，扩展会优先用它读取楼层消息；否则回退到 SillyTavern 官方 `SillyTavern.getContext().chat`。

## 兼容性说明

该扩展使用 SillyTavern UI Extension 的 `manifest.json` + `index.js` 格式，并依赖当前聊天 DOM 中的 `.mes[mesid]` 与旧消息加载按钮 `#show_more_messages`。
