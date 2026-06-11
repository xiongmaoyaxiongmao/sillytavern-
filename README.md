# SillyTavern Tool Ball

一个 SillyTavern 统一悬浮球：把聊天搜索和 API 连接配置切换放在同一个入口里。

## 功能

- 一个可拖动悬浮球，位置会保存。
- 点击悬浮球打开工具面板。
- 面板里可以打开聊天搜索。
- 面板里可以查看并切换 SillyTavern Connection Profiles。
- 聊天搜索支持点击结果跳转到对应楼层。
- 如果目标楼层还没渲染，会自动点击 `#show_more_messages` 加载旧楼层后再跳转。
- 同一条长消息里关键词命中多次时，可以在这一条消息内部上一处/下一处翻命中。
- 若页面中已有 Tavern Helper / JS-Slash-Runner 的 `getChatMessages`，会优先用它读取楼层消息；否则回退到 `SillyTavern.getContext().chat`。

## 安装

把整个文件夹复制到 SillyTavern 的扩展目录之一：

- 全局安装：`public/scripts/extensions/third-party/sillytavern-chat-search-jump`
- 用户安装：`data/<user-handle>/extensions/sillytavern-chat-search-jump`

然后刷新 SillyTavern 页面。

如果你之前安装了独立的 `sillytavern-api-` / `Floating API Switcher`，建议禁用或卸载旧扩展，只保留这个统一悬浮球，避免页面上出现两个 API 悬浮球。

## 使用

- 拖动悬浮球可以改变位置。
- 单击悬浮球打开工具面板。
- 点 `聊天搜索` 打开搜索面板。
- 在 `API 配置` 里点配置名即可切换当前 Connection Profile。
- `Ctrl+Shift+F` 仍可直接打开聊天搜索。

## API 切换前置条件

- SillyTavern 的内置 **Connection Profiles** 扩展已启用。
- 已经在「API 连接 -> 连接配置」里创建了至少一个配置。

API 切换调用 SillyTavern 官方斜杠命令：

- `/profile-list`
- `/profile`
- `/profile 配置名`

不直接改 SillyTavern 内部数据结构。
