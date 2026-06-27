# SillyTavern Tool Ball

一个 SillyTavern 统一悬浮球：聊天搜索、搜索结果跳转、消息收藏、Connection Profile 快捷切换、API / Settings Preset 解耦都放在同一个入口里。

## v0.5.2

- 改成 Git 可更新版：`manifest.json` 已添加 `homePage`，并把 `auto_update` 设为 `true`。
- 保留 v0.5.1：搜索弹窗右上角 `API` 入口，可直接打开“预设/API 解耦”工具面板。
- 保留：预设不改 API、锁定当前连接、API-only 切换 Profile、搜索跳转、自动加载旧楼层、收藏消息。

## 本版修复 / 新增

- 新增“预设不改 API”保护：扩展启动后会自动关闭 SillyTavern 的 `bind_preset_to_connection`，切换 Chat Completion Settings Preset 时不再顺手改 API / 模型 / 地址。
- 新增切预设前拦截：监听 `OAI_PRESET_CHANGED_BEFORE`，在预设真正应用前移除 API 连接字段；就算官方开关一时没渲染出来，也能拦住一层。
- 新增 API 锁：可以把当前 Connection Profile 锁住；如果某个预设或插件把 API 带跑，扩展会自动恢复到锁定的连接配置。
- 保留 API-only Profile 切换：用悬浮球点 Profile 时默认只切 `api`、`api-url`、`model`、`proxy`、`secret-id`，不切 Settings Preset。
- 新增“一键解绑已有 Profile 的预设”：删除 Connection Profiles 里已经保存的 `preset` 字段，并把 `preset` 加入排除列表。
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
- 默认开启 `预设不改 API` 和 `锁定当前连接`。
- 点 `把当前 API 设为锁定`，会把当前 Connection Profile 作为守护目标。
- 之后正常切 Settings Preset；扩展会尽量保证 API / 模型 / endpoint 不跟着跑。
- 点 Connection Profile 名称时，默认走 API-only 切换：换 API / 模型，不换当前 Settings Preset。
- 点 `解绑已有 Profile 的预设`，会清理已保存 Profile 里的 Settings Preset 字段。
- 点 `聊天搜索` 可搜索当前聊天；点击结果跳楼层。
- 搜索结果右侧点星标可收藏消息；工具面板里的 `收藏消息` 可查看收藏。
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

## v0.5.4

- 修复工具面板内容超出高度时不能滚动的问题。
- 工具面板现在会根据当前窗口高度动态设置 `max-height`，底部按钮不再被裁掉。
- 增加面板内部滚动保护，避免滚轮 / 触控板事件被 SillyTavern 页面滚动处理吞掉。
