# SillyTavern Tool Ball

一个轻量悬浮球，包含：

- API 管理器配置快捷连接。
- 跨角色、跨存档的关键词搜索与上下文阅读。
- 原有当前聊天收藏的查看、跳转与移除。

## v0.7.6

- 搜索改用酒馆的同一个地址。同一 Wi-Fi 下，手机打开电脑的酒馆后可以直接使用球球搜索。
- 服务端连接按需启动电脑上的索引服务，手机无需另开程序；搜索、上下文阅读和更新索引都通过酒馆访问。
- 沿用酒馆的登录、访问白名单与会话校验，并核对索引所属用户。索引端口仍只监听电脑本机。
- 首次使用需要在电脑上安装下述服务端连接并重启一次酒馆。API 与已有收藏保持原有行为。

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

### 启用手机和电脑共用的存档搜索

在电脑上安装完整仓库后，从插件目录运行一次（将参数替换为包含 `server.js` 的酒馆目录）：

```sh
python3 server-plugin/install.py "/path/to/SillyTavern"
```

确认酒馆 `config.yaml` 中 `enableServerPlugins: true`，然后重启一次酒馆并刷新网页。安装脚本仅添加本插件的服务端加载入口，不修改酒馆核心代码或配置；以后更新插件的服务端代码时，也需要重启酒馆。

手机和电脑使用各自原来打开酒馆的地址，点击球球 → 搜索。手机不应填写 `127.0.0.1:18765`。电脑和酒馆需要保持运行，搜索服务会在首次打开搜索时自动启动。

电脑需要 Python 3.9 或更新版本，且酒馆进程能使用 `python3`。服务端会核对索引目录与当前酒馆用户，已有索引属于其他用户时会停止读取并提示，不会混用数据。

搜索服务仍使用电脑本机端口 `18765`，只读取已保存的聊天文件，不调用模型。独立窗口仍可通过 `outputs/chat-archive-search/打开聊天搜索.command` 打开。详细的数据位置与搜索规则见 [存档搜索说明](outputs/chat-archive-search/README.md)。

## Git 安装

```text
https://github.com/xiongmaoyaxiongmao/sillytavern-.git
```
