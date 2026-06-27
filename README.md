# SillyTavern Tool Ball

一个 SillyTavern 统一悬浮球：把聊天搜索、搜索结果跳转、消息收藏和 API 连接配置切换放在同一个入口里。

## 本版修复/新增

- 修复聊天搜索结果点击后不能跳转的问题：搜索优先读取 `SillyTavern.getContext().chat`，结果楼层 ID 与页面 `.mes[mesid]` 对齐。
- 修复旧楼层未渲染时不能自动加载的问题：跳转目标比当前最早渲染楼层更旧时，会循环触发 `#show_more_messages`，直到目标楼层出现或按钮不可用。
- 新增消息收藏：搜索结果右侧点星标即可收藏；收藏保存在当前聊天的 `chatMetadata` 中，切换聊天不会串数据。
- 收藏列表可直接跳转、取消收藏、清空当前聊天收藏。
- 跳转后会滚动到目标楼层，并对整条消息加边框闪烁；如果当前搜索词仍存在于消息正文，会高亮并支持上一处/下一处命中。

## 安装

把整个文件夹复制到 SillyTavern 的扩展目录之一：

- 全局安装：`public/scripts/extensions/third-party/sillytavern-chat-search-jump`
- 用户安装：`data/<user-handle>/extensions/sillytavern-chat-search-jump`

然后刷新 SillyTavern 页面。

如果你之前安装了独立的 `sillytavern-api-` / `Floating API Switcher`，建议禁用或卸载旧扩展，只保留这个统一悬浮球，避免页面上出现两个 API 悬浮球。

## 使用

- 拖动悬浮球可以改变位置，位置会保存。
- 单击悬浮球打开工具面板。
- 点 `聊天搜索` 打开搜索面板。
- 输入关键词后，点击搜索结果可跳转到对应楼层。
- 如果目标楼层还没渲染，扩展会自动点击 `#show_more_messages` 加载旧楼层后再跳转。
- 搜索结果右侧点星标可收藏消息。
- 点工具面板里的 `收藏消息`，可查看、跳转、取消收藏。
- `Ctrl+Shift+F` 可直接打开聊天搜索。
- 搜索结果命中多处时，可用面板里的上一处/下一处命中按钮切换。

## API 切换前置条件

- SillyTavern 的内置 **Connection Profiles** 扩展已启用。
- 已经在「API 连接 -> 连接配置」里创建了至少一个配置。

API 切换调用 SillyTavern 斜杠命令：

- `/profile-list`
- `/profile`
- `/profile 配置名`

不直接改 SillyTavern 内部数据结构。
