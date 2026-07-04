# SillyTavern Tool Ball

一个 SillyTavern 统一悬浮球：聊天搜索、搜索结果跳转、消息收藏、Connection Profile 快捷切换、API / Settings Preset 解耦都放在同一个入口里。

## v0.6.1

- API 管理器记录不再根据 `claude-*` 模型名、Anthropic URL、Cloudflare Anthropic 网关路径自动改成 Claude source。
- 配置里的 `source` 是唯一准则：`custom` 永远按 Custom (OpenAI兼容) 中转站处理；只有显式 `source: "claude"` / `anthropic` 才切到 Claude / Anthropic。

## v0.6.0

- 重做悬浮球里的 API 切换器：API 管理器记录优先展示，并按 SillyTavern 的 Chat Completion Source 打标签，例如 OpenRouter、Groq、DeepSeek、Claude / Anthropic、Custom (OpenAI兼容)。
- 特殊渠道不再被压成 Custom OpenAI：只要配置记录里的 `source` 不是 `custom`，切换时就写入对应的 `chat_completion_source`，密钥、模型字段也跟随具体渠道。
- endpoint 写入按配置字段执行：Custom 写 `custom_url`，支持反代的来源才写显式 `reverseProxy`；SiliconFlow、Minimax、Z.ai、Azure OpenAI、Workers AI 这类来源会写入对应的专用 endpoint 字段。
- 工具入口收敛为一个“搜索 / 收藏”二合一面板：仍可在当前聊天按文字搜索记录、跳转命中楼层、收藏消息和查看前后快照。
- API 守护现在监听 Chat Completion Source 变化，手动改来源后会优先匹配 API 管理器记录，再回落到 Connection Profile。

## v0.5.16

- API 管理器记录现在会先归一化为真实 Chat Completion 目标：`custom`、`claude`、`makersuite`，不再把所有 URL 都压成 Custom OpenAI。
- 旧版曾让 Cloudflare AI Gateway 的 Anthropic 地址、`anthropic` 来源、`claude-*` 模型走 Claude source；v0.6.1 起只保留显式 `source` 规则，不再按模型名或 URL 自动推断。
- 切换后当前状态校验同步支持 Claude reverse proxy，后台守护不会再把 CF Anthropic 目标误判成 Custom OpenAI 目标。

## v0.5.15

- 重构 API 切换核心：新增插件自己的 `activeApiTargetKey`，当前 API 不再由 SillyTavern 官方 `selectedProfile` 决定。
- API 管理器记录和官方 Connection Profile 都转换成 `ApiTarget`，但不再互相伪装；点击 API 管理器记录不会改官方 selectedProfile。
- 自定义 URL 的 API 管理器记录统一走 Chat Completion 主 API + `custom` URL 源，避免把 `cf` / 分组名当成 `/api` 命令导致切换失败后回跳旧 Profile。
- 后台守护恢复的是当前 `ApiTarget`，不是旧的 `lockedProfileKey`；旧字段仅用于一次性迁移兼容。

## v0.5.14

- 悬浮球 API 列表直接读取 `api-config-manager.configs`，API 管理器里的记录会作为可点击连接项出现，不需要再手动创建一份 Connection Profile。
- Profile 列表改为统一数据源：原生 Connection Profiles 和 API 管理器记录都会规范化成同一种内部连接对象，点击时用稳定 key，不再用名称/fuzzy 匹配。
- 后台锁定改为保存 `lockedProfileKey`，兼容旧 `lockedProfile` 名称，但新切换不再受 profile 名字前后空格影响。

## v0.5.13

- 修复 Profile 切换后官方面板仍停在旧 Custom URL / model 的问题：现在通过 SillyTavern 原生输入事件写入 `custom_url` 和 `custom_model`，并立即调用原生 `saveSettings()` 落盘。
- 切换 Profile 时不再触发 `#openai_proxy_preset` change，也不再自动点击官方连接按钮，避免面板卡在“连接中”。
- 切换完成后会取消当前连接状态检查并恢复到未连接状态，连接动作交给用户手动连接或发消息时发生。

## v0.5.12

- 重做 Profile 切换：不再调用 SillyTavern 原生 `/profile` 全量加载，避免 preset/proxy 把 API 覆盖回旧值。
- 点击 Profile 只应用连接字段：API、API URL、模型、密钥，并同步 Connection Manager 当前选中项。
- 对 Custom OpenAI-compatible Profile 会清掉旧 reverse proxy，避免 `proxy: 风铃草` 覆盖 Profile 自己的 `api-url`。
- 后台 API / preset 解耦强制开启，不再受旧保存开关影响。

## v0.5.11

- 隐藏前端的 `预设不改 API` 和 `API-only：不改预设` 两个开关，相关逻辑改为后台默认运行。

## v0.5.10

- 修复 `manifest.json` 的 `homePage`，统一指向 `https://github.com/xiongmaoyaxiongmao/sillytavern-.git`。
- 版本号更新到 `0.5.10`，避免扩展管理器继续显示旧版。
- 曾短暂改为走 SillyTavern 原生 `/profile`，已在 v0.5.12 改为扩展自有连接应用器。
- 移除前端“官方绑定 / 锁定”状态卡，只保留后台守护逻辑。

## v0.5.8

- 清理 API / 预设保护面板：移除可见的“锁定当前连接”开关，改成隐藏默认行为。
- 删除“解绑已有 Profile 的预设”入口；悬浮球 Profile 切换继续默认只切 API / URL / 模型 / 密钥，不再需要手动清理 Profile。
- 手动在 SillyTavern 里换 API / Connection Profile 时，会把新的当前连接自动作为后台守护目标；切预设导致 API 被带跑时再自动恢复。
- 面板说明文字同步精简，减少重复选项。

## v0.5.7

- 修复旧楼层跳转失败时只弹警告的问题：如果目标楼层在聊天数据里但没有被 SillyTavern 渲染，会自动打开“前后快照”。
- 隐藏 / 系统消息命中后不再硬跳转，因为这类消息通常没有可滚动的 `.mes` 楼层；点击结果会直接打开快照查看。
- 自动加载旧楼层增强：会先滚到聊天顶部，再尝试点击 `#show_more_messages`，并额外 fallback 到 SillyTavern 核心 `showMoreMessages()`。
- 搜索结果里的隐藏标记改成中文“隐藏”。

## v0.5.2

- 改成 Git 可更新版：`manifest.json` 已添加 `homePage`，并把 `auto_update` 设为 `true`。
- 保留 v0.5.1：搜索弹窗右上角 `API` 入口，可直接打开“预设/API 解耦”工具面板。
- 保留：后台预设/API 解耦、隐藏默认的当前连接保护、连接字段切换 Profile、搜索跳转、自动加载旧楼层、收藏消息。

## 本版修复 / 新增

- 新增“预设不改 API”保护：扩展启动后会自动关闭 SillyTavern 的 `bind_preset_to_connection`，切换 Chat Completion Settings Preset 时不再顺手改 API / 模型 / 地址。
- 新增切预设前拦截：监听 `OAI_PRESET_CHANGED_BEFORE`，在预设真正应用前移除 API 连接字段；就算官方开关一时没渲染出来，也能拦住一层。
- API 锁改为隐藏默认：扩展会把当前 Connection Profile 当成后台守护目标；如果某个预设或插件把 API 带跑，会自动恢复。
- 手动换 API / Connection Profile 时，后台守护目标会同步到新的当前连接。
- 保留连接字段 Profile 切换：用悬浮球点 Profile 时只切 `api`、`api-url`、`model`、`secret-id`，不切 Settings Preset，也不执行 Profile 里的 `proxy`。
- 保留并修复聊天搜索：点击搜索结果跳转对应楼层。
- 保留旧楼层自动加载：目标楼层还没渲染时，会循环触发 `#show_more_messages` 加载旧消息后再跳转。
- 保留消息收藏：收藏保存在当前聊天的 `chatMetadata`，切换聊天不会串数据。

## Git 安装 / 更新

推荐在 SillyTavern 里通过 Git URL 安装：

```text
https://github.com/xiongmaoyaxiongmao/sillytavern-.git
```

在 SillyTavern 顶部菜单打开：

```text
Extensions -> Install extension
```

粘贴上面的 Git URL，分支填 `main` 或留空。以后可以在：

```text
Extensions -> Manage extensions
```

里更新扩展。

如果你之前是复制 ZIP 安装的，请先删除或禁用旧的本地复制版，避免同一个扩展加载两份。

## 本地手动安装

把整个文件夹复制到 SillyTavern 的扩展目录之一：

- 用户安装：`data/<user-handle>/extensions/sillytavern-tool-ball`
- 全局安装：`public/scripts/extensions/third-party/sillytavern-tool-ball`

如果你已经安装旧版，直接用本包里的 `index.js`、`style.css`、`manifest.json`、`README.md` 覆盖同名文件即可。

## 使用

- 单击悬浮球打开工具面板。
- API / 预设解耦和当前连接守护是后台默认行为，不需要手动点开关。
- 之后正常切 Settings Preset；扩展会尽量保证 API / 模型 / endpoint 不跟着跑。
- 点 Connection Profile 名称时，只应用连接字段：API、API URL、模型、密钥；不换当前 Settings Preset，也不执行 Profile 的 proxy 字段。
- 如果你在 SillyTavern 原生界面手动换了 API / Connection Profile，扩展会把新的当前连接自动作为后台守护目标。
- 点 `聊天搜索` 可搜索当前聊天；点击结果跳楼层。
- 搜索结果右侧点星标可收藏消息；工具面板里的 `收藏消息` 可查看收藏。
- `Ctrl+Shift+F` 可直接打开聊天搜索。

## API / 预设解耦机制

新版会同时做四层保护：

1. 直接关闭官方 `bind_preset_to_connection` 开关。
2. 动态访问 SillyTavern 的 `openai.js` 模块，把 `oai_settings.bind_preset_to_connection` 设为 `false`。
3. 监听 `OAI_PRESET_CHANGED_BEFORE`，在预设应用前删除 `settingsToUpdate` 中标记为 connection 的字段。
4. 如果仍被别的东西改掉，则用隐藏默认的 API 守护恢复到切预设前的 Connection Profile。

这是扩展层的“软解绑”，不改 SillyTavern 主体代码；更新 SillyTavern 后如果官方内部事件名大改，可能需要再补兼容。

## API 切换前置条件

- SillyTavern 内置 **Connection Profiles** 扩展已启用。
- 已经在「API 连接 -> 连接配置」里创建至少一个配置。

连接字段 Profile 切换会读取这些斜杠命令和官方状态：

- `/profile-list`
- `/profile-get 配置名`
- `/api`
- `/secret-id`

Custom OpenAI-compatible Profile 会通过官方输入事件写入 `custom_url` / `custom_model`，额外清掉旧 reverse proxy，并调用 SillyTavern 原生 `saveSettings()` 保存，防止旧代理预设覆盖 Profile 自己的 API URL。

## v0.5.4

- 修复工具面板内容超出高度时不能滚动的问题。
- 工具面板现在会根据当前窗口高度动态设置 `max-height`，底部按钮不再被裁掉。
- 增加面板内部滚动保护，避免滚轮 / 触控板事件被 SillyTavern 页面滚动处理吞掉。


## v0.5.6

- 搜索结果和收藏项右侧新增“前后”按钮，用来打开目标楼层的前后快照。
- 快照默认显示目标楼层前 3 条、目标楼层、后 3 条，并高亮当前搜索词。
- 快照里可以直接“跳这层”或“跳到命中楼层”，仍会走自动加载旧楼层后跳转的逻辑。
- 关闭搜索面板、切换聊天、切换搜索/收藏 Tab 时会自动关闭快照，避免旧快照卡住。
