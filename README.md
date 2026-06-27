# SillyTavern Tool Ball

一个 SillyTavern 统一悬浮球：聊天搜索、搜索结果跳转、消息收藏、Connection Profile 快捷切换、API / Settings Preset 解耦都放在同一个入口里。

## v0.5.5

- 新增“前后快照”：搜索结果和收藏项右侧多了 `快照` 按钮。
- 点 `快照` 会在搜索窗口内打开目标楼层前 3 楼 / 后 3 楼。
- 快照里的每一楼都有 `跳到这层`；如果楼层还没渲染，仍会自动加载旧消息后再跳转。
- 快照会高亮当前搜索词；长消息会先截断显示，跳转到楼层可看全文。
- 保留 v0.5.4 工具面板滚动修复、API / 预设解耦、搜索跳转和收藏功能。

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
- 点 `聊天搜索` 可搜索当前聊天；点击结果跳楼层，点结果右侧 `快照` 可查看上下文快照。
- 搜索结果右侧点星标可收藏消息；工具面板里的 `收藏消息` 可查看收藏。
- 默认开启 `预设不改 API` 和 `锁定当前连接`。
- 点 Connection Profile 名称时，默认走 API-only 切换：换 API / 模型，不换当前 Settings Preset。
- `Ctrl+Shift+F` 可直接打开聊天搜索。

## API / 预设解耦机制

新版会同时做四层保护：

1. 直接关闭官方 `bind_preset_to_connection` 开关。
2. 动态访问 SillyTavern 的 `openai.js` 模块，把 `oai_settings.bind_preset_to_connection` 设为 `false`。
3. 监听 `OAI_PRESET_CHANGED_BEFORE`，在预设应用前删除 `settingsToUpdate` 中标记为 connection 的字段。
4. 如果仍被别的东西改掉，则用“API 锁”恢复到锁定的 Connection Profile。

这是扩展层的“软解绑”，不改 SillyTavern 主体代码；更新 SillyTavern 后如果官方内部事件名大改，可能需要再补兼容。

## API 切换前置条件

- SillyTavern 内置 **Connection Profiles** 扩展已启用。
- 已经在「API 连接 -> 连接配置」里创建至少一个配置。

API-only Profile 切换主要调用这些斜杠命令：

- `/profile-list`
- `/profile`
- `/profile-get 配置名`
- `/api`
- `/api-url`
- `/model`
- `/proxy`
- `/secret-id`

如果某些旧版本没有单字段切换命令，扩展会降级为完整 Profile 切换，然后恢复原来的 Settings Preset。
