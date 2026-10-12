# SillyTavern Tool Ball

一个轻量悬浮球，包含：

- API 管理器配置快捷连接。
- 跨角色、跨存档的关键词搜索与上下文阅读。
- 原有当前聊天收藏的查看、跳转与移除。

## v0.7.5

- “搜索”页直接替换为存档搜索，移除旧的“搜索当前聊天”输入区。
- 点选搜索片段，在球球内阅读前后文、翻页和跳转下一处命中。
- 搜索页自动放宽，窄屏可在结果和阅读区之间返回；切换标签或关闭球球保留本次搜索。
- 本地服务未启动时显示启动说明和“重新连接”。API 管理与已有收藏保持原有行为。

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

### 启动存档搜索

在插件目录的 `outputs/chat-archive-search` 文件夹中，双击 **打开聊天搜索.command**。服务启动后，在球球内点击“搜索”即可使用。关闭独立网页不会停止后台服务；电脑重启后需要再次启动。

内嵌搜索支持本机默认酒馆地址 `http://127.0.0.1:8000` 和 `http://localhost:8000`。存档服务使用本机端口 `18765`，只读取已保存的聊天文件，不调用模型。需要 Python 3.9 或更新版本。详细的数据位置与搜索规则见 [存档搜索说明](outputs/chat-archive-search/README.md)。

从 v0.7.4 升级后，需要重启已运行的存档搜索服务，再刷新酒馆页面。旧服务不允许页面内嵌，仅刷新酒馆不能更新该后台服务。

## Git 安装

```text
https://github.com/xiongmaoyaxiongmao/sillytavern-.git
```
