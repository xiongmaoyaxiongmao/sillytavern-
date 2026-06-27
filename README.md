# SillyTavern Tool Ball

一个 SillyTavern 统一悬浮球：把聊天搜索、搜索结果跳转、消息收藏、Connection Profile 切换，以及 API / Settings Preset 解耦保护放在同一个入口里。

## 本版修复 / 新增

- 新增 **API / Settings Preset 解耦保护**：默认关闭 Chat Completion 的 `bind_preset_to_connection`，切换预设时不再带着 API 来源、模型、地址一起变。
- 新增 **预设切换事件保护**：监听 `OAI_PRESET_CHANGED_BEFORE`，在预设真正应用前剥离 API / URL / 模型 / 代理 / 密钥等连接字段。
- 新增 **API-only Profile 切换**：悬浮球里的 Profile 列表默认只应用 `api`、`api-url`、`model`、`proxy`、`secret-id`，不会套用 Profile 里保存的 Settings Preset。
- 新增 **锁定当前 API Profile**：切预设或其它 UI 操作导致 API Profile 跑掉时，自动拉回锁定的 Profile；用悬浮球切换 Profile 后会同步更新锁定目标。
- 新增 **一键解绑已有 Profile 的预设**：删除 Connection Profiles 里已经保存的 `preset` 字段，并把 `preset` 加入排除列表。
- 保留并修复聊天搜索结果点击跳转：搜索结果楼层 ID 与页面 `.mes[mesid]` 对齐。
- 保留旧楼层自动加载：目标楼层还没渲染时，会循环触发 `#show_more_messages`，直到目标楼层出现或无法继续加载。
- 保留消息收藏：搜索结果右侧点星标即可收藏；收藏保存在当前聊天的 `chatMetadata` 中，切换聊天不会串数据。

## 安装

把整个文件夹复制到 SillyTavern 的扩展目录之一：

- 全局安装：`public/scripts/extensions/third-party/sillytavern-chat-search-jump`
- 用户安装：`data/<user-handle>/extensions/sillytavern-chat-search-jump`

然后刷新 SillyTavern 页面。

如果你之前安装了独立的 `sillytavern-api-` / `Floating API Switcher`，建议禁用或卸载旧扩展，只保留这个统一悬浮球，避免页面上出现两个 API 悬浮球。

## 使用

- 拖动悬浮球可以改变位置，位置会保存。
- 单击悬浮球打开工具面板。
- `聊天搜索`：打开搜索面板，输入关键词后点击结果跳转到对应楼层。
- `收藏消息`：查看、跳转、取消收藏当前聊天里的收藏消息。
- `切预设不改 API`：默认开启；会关闭 SillyTavern 的预设/API绑定，并在预设切换事件里拦截连接字段。
- `API-only：不改预设`：默认开启；点下面的 Profile 时只切 API 相关字段，不切 Settings Preset。
- `锁定当前 API Profile`：默认开启；切预设后如果 API Profile 被带跑，会自动拉回锁定的 Profile。
- `把当前 API 设为锁定`：把当前 Connection Profile 设成锁定目标。
- `解绑已有 Profile 的预设`：把 Connection Profiles 里已经保存的 Settings Preset 字段移除。
- `Ctrl+Shift+F`：直接打开聊天搜索。
- 搜索结果命中多处时，可用面板里的上一处 / 下一处命中按钮切换。

## API 切换前置条件

- SillyTavern 的内置 **Connection Profiles** 扩展已启用。
- 已经在「API 连接 -> 连接配置」里创建了至少一个配置。

API 切换主要调用 SillyTavern 斜杠命令：

- `/profile-list`
- `/profile`
- `/profile-get 配置名`
- `/preset`
- `/api`
- `/api-url`
- `/model`
- `/proxy`
- `/secret-id`

默认的 API-only 切换不会调用完整 `/profile 配置名`，因此不会应用 Profile 里保存的 `preset`。只有你在悬浮球里关闭“API-only：不改预设”后，才会按 SillyTavern 原本方式完整切换 Profile。

## 说明

“一键解绑已有 Profile 的预设”会直接修改 `extensionSettings.connectionManager.profiles`，删除每个 Profile 的 `preset` 字段并把 `preset` 写入 `exclude`，然后调用 `saveSettingsDebounced()` 保存。之后即使用官方 Connection Profiles 下拉切换，也更不容易因为 Profile 自带的 Settings Preset 把当前预设换掉。
