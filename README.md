# SillyTavern Tool Ball

一个轻量悬浮球，包含两件事：

- API 管理器配置快捷连接。
- 当前聊天文字搜索与收藏。

## v0.7.4

- 修复隐藏消息模板导致旧楼层无法自动加载、跳转的问题。
- 跳转等待加载完成，切换聊天时取消旧跳转，连续点击以最后一次为准。
- 搜索优先使用当前保存正文；搜索与预览高亮共用空白规范化规则。

## v0.7.3

- API 切换按钮和 API 标签图标改为 `✏️`。
- 补全所有 SillyTavern Chat Completion source 的 label、secret、model 映射。

## v0.7.2

- API 切换不再展开设置栏、滚动到连接按钮或把页面带离聊天。
- endpoint、model、proxy password 改为静默写入，最后只触发一次 Chat Completions 重连。

## v0.7.1

- API 切换前先把 SillyTavern 主 API 切到 Chat Completions/OpenAI。
- 切换时先静默写入来源、endpoint、model、secret，最后只触发一次 SillyTavern 原生重连。

## v0.7.0

- 删除旧的 profile 守护、恢复、slash 串行切换和重复写入流程。
- API 切换改为直接读取 `api-config-manager` 的配置，写入 Chat Completion source、endpoint、model、secret-id 后立刻触发 SillyTavern 原生连接按钮。
- 不再根据 `claude-*` 模型名或 Anthropic URL 自动切到 Claude；带 `api_key_custom` 的历史 Claude 污染配置会恢复为 Custom (OpenAI兼容) 中转站。
- 搜索和收藏重写为同一个悬浮面板内的两个视图，收藏保存在当前聊天 metadata 中。

## 使用

把仓库内容放到：

```text
SillyTavern/public/scripts/extensions/third-party/sillytavern-tool-ball
```

刷新 SillyTavern 页面后，右侧会出现悬浮球。

## Git 安装

```text
https://github.com/xiongmaoyaxiongmao/sillytavern-.git
```
