# SillyTavern Tool Ball

一个轻量悬浮球，包含两件事：

- API 管理器配置快捷连接。
- 当前聊天文字搜索与收藏。

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
