(() => {
    'use strict';

    const MODULE_NAME = 'chat_search_jump';
    const METADATA_KEY = 'chat_search_jump_favorites_v2';
    const ID = 'st-chat-search-jump';
    const CONNECTION_MANAGER_KEY = 'connectionManager';
    const CONNECTION_PRESET_FIELD = 'preset';
    const API_ONLY_PROFILE_COMMANDS = Object.freeze(['api', 'api-url', 'model', 'proxy', 'secret-id']);
    const MAX_AUTO_LOAD_ATTEMPTS = 120;
    const SEARCH_DEBOUNCE_MS = 120;
    const OFFICIAL_PRESET_CONNECTION_BIND_ID = 'bind_preset_to_connection';

    const DEFAULT_SETTINGS = Object.freeze({
        caseSensitive: false,
        includeHidden: true,
        includeNames: true,
        maxResults: 300,
        apiOnlySwitching: true,
        ballX: null,
        ballY: null,
        decouplePresetConnection: true,
        lockApiProfile: true,
        lockedProfile: '',
    });

    const fallbackSettings = { ...DEFAULT_SETTINGS };
    let fallbackFavoriteStore = null;
    let openAiModulePromise = null;

    const state = {
        query: '',
        results: [],
        activeIndex: -1,
        activeOccurrence: 0,
        initialized: false,
        toolsOpen: false,
        mode: 'search',
        currentProfile: '',
        currentPreset: '',
        searchToken: 0,
        jumpToken: 0,
        apiSwitching: false,
        profileRestoreTimer: null,
        suppressProfileRestoreUntil: 0,
    };

    const elements = {};

    const escapeMap = Object.freeze({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    });

    function getContext() {
        return globalThis.SillyTavern?.getContext?.() ?? null;
    }

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function getSettings() {
        const context = getContext();
        if (!context?.extensionSettings) {
            return fallbackSettings;
        }

        if (!context.extensionSettings[MODULE_NAME] || typeof context.extensionSettings[MODULE_NAME] !== 'object') {
            context.extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
        }

        const settings = context.extensionSettings[MODULE_NAME];
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
            if (!hasOwn(settings, key)) {
                settings[key] = value;
            }
        }

        return settings;
    }

    function saveSettings() {
        const context = getContext();
        try {
            context?.saveSettingsDebounced?.();
        } catch (error) {
            console.warn('[Chat Search Jump] Failed to save extension settings.', error);
        }
    }

    function setSetting(key, value) {
        const settings = getSettings();
        settings[key] = value;
        saveSettings();
        scheduleSearch();
    }

    async function runSlashCommand(command) {
        const context = getContext();
        if (!context) {
            return '';
        }

        try {
            if (typeof context.executeSlashCommandsWithOptions === 'function') {
                const result = await context.executeSlashCommandsWithOptions(command, {
                    handleExecutionErrors: true,
                    source: MODULE_NAME,
                });
                return typeof result?.pipe === 'string' ? result.pipe : '';
            }

            if (typeof context.executeSlashCommands === 'function') {
                const result = await context.executeSlashCommands(command);
                if (typeof result?.pipe === 'string') {
                    return result.pipe;
                }
                return typeof result === 'string' ? result : '';
            }
        } catch (error) {
            console.error('[SillyTavern Tool Ball] Slash command failed:', command, error);
        }

        return '';
    }

    function quoteSlashArg(value) {
        const text = String(value ?? '');
        if (!text) {
            return '""';
        }
        return /\s|"/.test(text) ? `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : text;
    }

    function parseProfiles(raw) {
        const text = String(raw ?? '').trim();
        if (!text) {
            return [];
        }

        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed.map(item => String(item ?? '').trim()).filter(Boolean);
            }
        } catch {
            // The slash command usually returns JSON, but older builds/extensions may return text.
        }

        return text
            .split(/\r?\n|,/)
            .map(line => line.replace(/^[-*\s]+/, '').trim())
            .filter(line => line && !/^current\s*profile/i.test(line));
    }

    async function getProfiles() {
        return parseProfiles(await runSlashCommand('/profile-list'));
    }

    async function getCurrentProfile() {
        return (await runSlashCommand('/profile')).trim();
    }

    async function switchProfile(name) {
        await runSlashCommand(`/profile ${quoteSlashArg(name)}`);
    }

    async function getOpenAiModule() {
        if (!openAiModulePromise) {
            openAiModulePromise = import('/scripts/openai.js').catch(error => {
                console.warn('[SillyTavern Tool Ball] Failed to import /scripts/openai.js.', error);
                return null;
            });
        }
        return openAiModulePromise;
    }

    function getChatCompletionSettings() {
        const context = getContext();
        return context?.chatCompletionSettings
            ?? context?.oai_settings
            ?? globalThis.oai_settings
            ?? null;
    }

    async function getOpenAiSettings() {
        const module = await getOpenAiModule();
        return module?.oai_settings ?? getChatCompletionSettings();
    }

    function setLocalPresetConnectionBinding(bound) {
        const next = Boolean(bound);
        const localSettings = getChatCompletionSettings();

        if (localSettings && hasOwn(localSettings, OFFICIAL_PRESET_CONNECTION_BIND_ID)) {
            const changed = localSettings[OFFICIAL_PRESET_CONNECTION_BIND_ID] !== next;
            localSettings[OFFICIAL_PRESET_CONNECTION_BIND_ID] = next;
            return changed;
        }

        return false;
    }

    async function setOpenAiPresetConnectionBinding(bound) {
        const next = Boolean(bound);
        const oaiSettings = await getOpenAiSettings();
        if (!oaiSettings || !hasOwn(oaiSettings, OFFICIAL_PRESET_CONNECTION_BIND_ID)) {
            return false;
        }

        const changed = oaiSettings[OFFICIAL_PRESET_CONNECTION_BIND_ID] !== next;
        oaiSettings[OFFICIAL_PRESET_CONNECTION_BIND_ID] = next;
        return changed;
    }

    function clonePlainObject(value) {
        if (!value || typeof value !== 'object') {
            return value;
        }

        try {
            if (typeof structuredClone === 'function') {
                return structuredClone(value);
            }
        } catch {
            // Fall through to JSON cloning.
        }

        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return { ...value };
        }
    }

    function parseJsonObject(value) {
        const text = String(value ?? '').trim();
        if (!text) {
            return null;
        }

        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    function getConnectionManagerStore() {
        const context = getContext();
        return context?.extensionSettings?.[CONNECTION_MANAGER_KEY] ?? null;
    }

    function getConnectionProfilesRaw() {
        const store = getConnectionManagerStore();
        return Array.isArray(store?.profiles) ? store.profiles : [];
    }

    function findConnectionProfile(value = '') {
        const search = String(value ?? '').trim();
        const profiles = getConnectionProfilesRaw();
        if (!profiles.length) {
            return null;
        }

        const store = getConnectionManagerStore();
        if (!search && store?.selectedProfile) {
            return profiles.find(profile => profile?.id === store.selectedProfile) || null;
        }

        return profiles.find(profile => profile?.id === search || profile?.name === search) || null;
    }

    async function getConnectionProfileDetails(name = '') {
        const localProfile = findConnectionProfile(name);
        if (localProfile) {
            return clonePlainObject(localProfile);
        }

        const command = name ? `/profile-get ${quoteSlashArg(name)}` : '/profile-get';
        return parseJsonObject(await runSlashCommand(command));
    }

    function hasProfilePreset(profile) {
        return Boolean(profile && hasOwn(profile, CONNECTION_PRESET_FIELD) && profile[CONNECTION_PRESET_FIELD]);
    }

    function countPresetBoundProfiles() {
        return getConnectionProfilesRaw().filter(hasProfilePreset).length;
    }

    function describeApiOnlyProfile(profile) {
        if (!profile) {
            return '';
        }

        const parts = [profile.api, profile['api-url'], profile.model]
            .map(value => String(value ?? '').trim())
            .filter(Boolean);
        return parts.length ? parts.join(' / ') : 'API 设置';
    }

    async function runProfileFieldCommand(command, value) {
        if (value === undefined || value === null || value === '') {
            return false;
        }

        await runSlashCommand(`/${command} ${quoteSlashArg(value)}`);
        return true;
    }

    async function emitConnectionProfileLoaded(profile) {
        const context = getContext();
        const eventTypes = context?.eventTypes ?? context?.event_types ?? {};
        const eventType = eventTypes.CONNECTION_PROFILE_LOADED;
        if (!eventType || typeof context?.eventSource?.emit !== 'function') {
            return;
        }

        try {
            await context.eventSource.emit(eventType, profile?.name || '');
        } catch (error) {
            console.warn('[SillyTavern Tool Ball] Failed to emit CONNECTION_PROFILE_LOADED.', error);
        }
    }

    function updateConnectionProfilesDropdown(profile) {
        const select = document.getElementById('connection_profiles');
        if (!select || !profile?.id) {
            return;
        }

        try {
            select.value = profile.id;
        } catch {
            // Ignore UI sync failures; the API settings have already been applied.
        }
    }

    async function markConnectionProfileSelected(profile) {
        const store = getConnectionManagerStore();
        if (store && profile?.id) {
            store.selectedProfile = profile.id;
            saveSettings();
        }

        updateConnectionProfilesDropdown(profile);
        await emitConnectionProfileLoaded(profile);
    }

    async function getCurrentPresetName() {
        return (await runSlashCommand('/preset')).trim();
    }

    async function restorePresetName(name) {
        const preset = String(name ?? '').trim();
        if (!preset) {
            return;
        }
        await runSlashCommand(`/preset ${quoteSlashArg(preset)}`);
    }

    async function applyProfileFieldsWithoutPreset(profile) {
        let appliedCount = 0;
        for (const command of API_ONLY_PROFILE_COMMANDS) {
            const applied = await runProfileFieldCommand(command, profile?.[command]);
            if (applied) {
                appliedCount += 1;
            }
        }
        return appliedCount;
    }

    async function switchProfileApiOnly(name) {
        const profile = await getConnectionProfileDetails(name);
        const previousPreset = await getCurrentPresetName();

        state.apiSwitching = true;
        suppressProfileRestore(4000);
        try {
            await ensurePresetConnectionDecoupled({ notify: false });

            if (profile) {
                const appliedCount = await applyProfileFieldsWithoutPreset(profile);
                if (appliedCount > 0) {
                    await markConnectionProfileSelected(profile);
                    if (previousPreset) {
                        state.currentPreset = previousPreset;
                    }
                    return profile.name || name;
                }
            }

            // Fallback for unusual Connection Profiles without separate API fields.
            // Full profile loading may touch the preset, so restore the user's previous preset immediately.
            globalThis.toastr?.warning?.('没有找到可单独应用的 API 字段，已改用完整 Profile 切换并恢复原预设。', 'SillyTavern Tool Ball');
            await switchProfile(name);
            await ensurePresetConnectionDecoupled({ notify: false });
            await restorePresetName(previousPreset);
            if (profile) {
                await markConnectionProfileSelected(profile);
            }
            state.currentPreset = previousPreset || await getCurrentPresetName();
            return profile?.name || name;
        } finally {
            setTimeout(() => {
                state.apiSwitching = false;
            }, 600);
        }
    }

    function stripPresetFromProfile(profile) {
        if (!profile || typeof profile !== 'object') {
            return false;
        }

        let changed = false;
        if (hasOwn(profile, CONNECTION_PRESET_FIELD)) {
            delete profile[CONNECTION_PRESET_FIELD];
            changed = true;
        }

        if (!Array.isArray(profile.exclude)) {
            profile.exclude = [];
            changed = true;
        }
        if (!profile.exclude.includes(CONNECTION_PRESET_FIELD)) {
            profile.exclude.push(CONNECTION_PRESET_FIELD);
            changed = true;
        }

        return changed;
    }

    async function decouplePresetFromConnectionProfiles() {
        const profiles = getConnectionProfilesRaw();
        let changedCount = 0;

        for (const profile of profiles) {
            if (stripPresetFromProfile(profile)) {
                changedCount += 1;
            }
        }

        if (changedCount > 0) {
            saveSettings();
        }

        globalThis.toastr?.success?.(
            changedCount > 0
                ? `已解绑 ${changedCount} 个连接配置里的 Settings Preset。之后用官方 Profile 下拉切换也不会顺手换预设。`
                : '所有连接配置都已经不绑定 Settings Preset。',
            'SillyTavern Tool Ball',
        );

        return changedCount;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => escapeMap[char]);
    }

    function cssEscape(value) {
        if (globalThis.CSS?.escape) {
            return globalThis.CSS.escape(String(value));
        }
        return String(value).replace(/["\\]/g, '\\$&');
    }

    function checkedAttribute(value) {
        return value ? ' checked' : '';
    }

    function getPresetConnectionBindCheckbox() {
        return document.getElementById(OFFICIAL_PRESET_CONNECTION_BIND_ID);
    }

    function emitInputAndChange(element) {
        if (!element) {
            return;
        }

        const eventOptions = { bubbles: true, cancelable: true };
        try {
            element.dispatchEvent(new Event('input', eventOptions));
            element.dispatchEvent(new Event('change', eventOptions));
        } catch (error) {
            console.warn('[SillyTavern Tool Ball] Failed to emit native input/change events.', error);
        }

        try {
            if (typeof globalThis.$ === 'function') {
                globalThis.$(element).trigger('input').trigger('change');
            }
        } catch (error) {
            console.warn('[SillyTavern Tool Ball] Failed to emit jQuery input/change events.', error);
        }
    }

    function readPresetConnectionBindState() {
        const checkbox = getPresetConnectionBindCheckbox();
        if (checkbox) {
            return { available: true, bound: Boolean(checkbox.checked), source: 'checkbox' };
        }

        const localSettings = getChatCompletionSettings();
        if (localSettings && hasOwn(localSettings, OFFICIAL_PRESET_CONNECTION_BIND_ID)) {
            return { available: true, bound: Boolean(localSettings[OFFICIAL_PRESET_CONNECTION_BIND_ID]), source: 'settings' };
        }

        return { available: false, bound: null, source: 'none' };
    }

    function syncPresetConnectionCheckbox(bound, triggerEvents = false) {
        const checkbox = getPresetConnectionBindCheckbox();
        if (!checkbox) {
            return false;
        }

        const next = Boolean(bound);
        const changed = checkbox.checked !== next;
        checkbox.checked = next;
        checkbox.setAttribute('aria-checked', String(next));
        if (triggerEvents && changed) {
            emitInputAndChange(checkbox);
        }
        return changed;
    }

    function getOfficialPresetConnectionBindState() {
        const stateInfo = readPresetConnectionBindState();
        if (!stateInfo.available) {
            return {
                available: false,
                bound: null,
                label: '官方绑定开关：未找到',
                detail: '使用内部兜底保护',
            };
        }

        return {
            available: true,
            bound: stateInfo.bound,
            label: stateInfo.bound ? '官方绑定：仍开启' : '官方绑定：已关闭',
            detail: stateInfo.bound ? '扩展会自动关掉它' : '切预设不会改 API 连接',
        };
    }

    function applyOfficialPresetConnectionDecouple({ notify = false, triggerUi = false } = {}) {
        const settings = getSettings();
        if (!settings.decouplePresetConnection) {
            return { available: readPresetConnectionBindState().available, changed: false };
        }

        const before = readPresetConnectionBindState();
        const changedLocal = setLocalPresetConnectionBinding(false);
        const changedCheckbox = syncPresetConnectionCheckbox(false, triggerUi);
        const changed = Boolean(changedLocal || changedCheckbox || before.bound === true);

        if (changed) {
            saveSettings();
        }

        if (notify && changed) {
            globalThis.toastr?.success?.('已关闭“预设绑定 API 连接”', 'SillyTavern Tool Ball');
        }

        return { available: before.available || changedLocal || Boolean(getPresetConnectionBindCheckbox()), changed };
    }

    async function ensurePresetConnectionDecoupled({ notify = false, triggerUi = false } = {}) {
        const local = applyOfficialPresetConnectionDecouple({ notify, triggerUi });
        const settings = getSettings();
        if (!settings.decouplePresetConnection) {
            return local;
        }

        const changedOpenAi = await setOpenAiPresetConnectionBinding(false);
        if (changedOpenAi) {
            saveSettings();
            if (notify && !local.changed) {
                globalThis.toastr?.success?.('已关闭“预设绑定 API 连接”', 'SillyTavern Tool Ball');
            }
        }

        return {
            available: local.available || changedOpenAi,
            changed: local.changed || changedOpenAi,
        };
    }

    function stripConnectionFieldsFromPresetEvent(payload) {
        const settings = getSettings();
        if (!settings.decouplePresetConnection || !payload) {
            return;
        }

        if (payload.settings && hasOwn(payload.settings, OFFICIAL_PRESET_CONNECTION_BIND_ID)) {
            payload.settings[OFFICIAL_PRESET_CONNECTION_BIND_ID] = false;
        }

        const preset = payload.preset;
        const settingsToUpdate = payload.settingsToUpdate;
        if (preset && settingsToUpdate && typeof settingsToUpdate === 'object') {
            for (const [presetKey, descriptor] of Object.entries(settingsToUpdate)) {
                const isConnectionSetting = Array.isArray(descriptor)
                    ? Boolean(descriptor[3])
                    : Boolean(descriptor?.isConnection || descriptor?.connection);
                if (isConnectionSetting && hasOwn(preset, presetKey)) {
                    delete preset[presetKey];
                }
            }
        }

        applyOfficialPresetConnectionDecouple({ notify: false, triggerUi: false });
    }

    async function setLockedProfileToCurrent({ notify = false } = {}) {
        const current = await getCurrentProfile();
        if (!current) {
            if (notify) {
                globalThis.toastr?.warning?.('没有读取到当前 Connection Profile。请先在酒馆里保存一个连接配置。', 'SillyTavern Tool Ball');
            }
            return '';
        }

        const settings = getSettings();
        settings.lockedProfile = current;
        settings.lockApiProfile = true;
        state.currentProfile = current;
        saveSettings();
        updateToolBallTitle();

        if (notify) {
            globalThis.toastr?.success?.(`已锁定当前 API 配置：${current}`, 'SillyTavern Tool Ball');
        }

        return current;
    }

    async function seedLockedProfileIfNeeded() {
        const settings = getSettings();
        if (!settings.decouplePresetConnection || !settings.lockApiProfile || settings.lockedProfile) {
            return settings.lockedProfile || '';
        }
        return setLockedProfileToCurrent({ notify: false });
    }

    async function setPresetConnectionDecouple(enabled) {
        const settings = getSettings();
        settings.decouplePresetConnection = Boolean(enabled);
        saveSettings();

        if (enabled) {
            await ensurePresetConnectionDecoupled({ notify: true, triggerUi: true });
            await seedLockedProfileIfNeeded();
            globalThis.toastr?.success?.('已开启：切换预设不改 API', 'SillyTavern Tool Ball');
        } else {
            globalThis.toastr?.info?.('已关闭：允许预设改动 API', 'SillyTavern Tool Ball');
        }
    }

    async function setApiProfileLock(enabled) {
        const settings = getSettings();
        settings.lockApiProfile = Boolean(enabled);

        if (enabled) {
            await setLockedProfileToCurrent({ notify: true });
        } else {
            saveSettings();
            globalThis.toastr?.info?.('已关闭连接配置锁定', 'SillyTavern Tool Ball');
        }
    }

    function suppressProfileRestore(durationMs = 1800) {
        state.suppressProfileRestoreUntil = Date.now() + durationMs;
    }

    function isProfileRestoreSuppressed() {
        return Date.now() < state.suppressProfileRestoreUntil;
    }

    async function restoreLockedProfileIfNeeded(reason = 'preset changed') {
        const settings = getSettings();
        if (!settings.decouplePresetConnection || !settings.lockApiProfile || !settings.lockedProfile) {
            return;
        }
        if (isProfileRestoreSuppressed()) {
            return;
        }

        applyOfficialPresetConnectionDecouple();

        const current = await getCurrentProfile();
        if (!current) {
            return;
        }

        state.currentProfile = current;
        updateToolBallTitle();

        if (current === settings.lockedProfile) {
            return;
        }

        suppressProfileRestore();
        const previousPreset = await getCurrentPresetName();
        if (settings.apiOnlySwitching) {
            await switchProfileApiOnly(settings.lockedProfile);
        } else {
            await switchProfile(settings.lockedProfile);
            await restorePresetName(previousPreset);
        }
        await ensurePresetConnectionDecoupled({ notify: false });
        const restored = await getCurrentProfile();
        state.currentProfile = restored || settings.lockedProfile;
        state.currentPreset = previousPreset || await getCurrentPresetName();
        updateToolBallTitle();

        if (state.toolsOpen) {
            renderToolPanel();
        }

        console.info(`[Chat Search Jump] Restored locked profile after ${reason}:`, settings.lockedProfile);
        globalThis.toastr?.info?.(`已保持 API 配置：${settings.lockedProfile}`, 'SillyTavern Tool Ball');
    }

    function scheduleLockedProfileRestore(reason = 'preset changed') {
        clearTimeout(state.profileRestoreTimer);
        state.profileRestoreTimer = setTimeout(() => {
            restoreLockedProfileIfNeeded(reason).catch(error => {
                console.warn('[Chat Search Jump] Failed to restore locked profile.', error);
            });
        }, 450);
    }

    function handlePresetChangedForApiGuard() {
        applyOfficialPresetConnectionDecouple();
        ensurePresetConnectionDecoupled({ notify: false }).catch(error => {
            console.warn('[SillyTavern Tool Ball] Failed to keep preset/API decoupled.', error);
        });
        getCurrentPresetName().then(preset => {
            state.currentPreset = preset;
            updateToolBallTitle();
        });
        if (state.apiSwitching) {
            return;
        }
        scheduleLockedProfileRestore('preset changed');
    }

    function getApiGuardStatusHtml() {
        const settings = getSettings();
        const official = getOfficialPresetConnectionBindState();
        const locked = settings.lockApiProfile && settings.lockedProfile
            ? `锁定：${settings.lockedProfile}`
            : (settings.lockApiProfile ? '锁定：等待读取当前配置' : '锁定：关闭');

        return `
            <div class="stcsj-api-status-line"><span>${escapeHtml(official.label)}</span><small>${escapeHtml(official.detail)}</small></div>
            <div class="stcsj-api-status-line"><span>${escapeHtml(locked)}</span><small>${settings.decouplePresetConnection ? '保护中' : '未保护'}</small></div>`;
    }

    function stripHtml(value) {
        const element = document.createElement('div');
        element.innerHTML = String(value ?? '');
        return element.textContent || element.innerText || '';
    }

    function collapseWhitespace(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function normalize(value, caseSensitive) {
        const text = stripHtml(value);
        return caseSensitive ? text : text.toLocaleLowerCase();
    }

    function roleLabel(role) {
        const labels = {
            user: '用户',
            assistant: '角色',
            system: '系统',
        };
        return labels[role] || role || '消息';
    }

    function getActiveSwipeText(message) {
        if (!Array.isArray(message?.swipes) || !message.swipes.length) {
            return '';
        }

        const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        const swipe = message.swipes[Math.max(0, Math.min(swipeId, message.swipes.length - 1))];
        if (typeof swipe === 'string') {
            return swipe;
        }
        return swipe?.mes || swipe?.message || '';
    }

    function getMessageText(message) {
        const swipe = getActiveSwipeText(message);
        if (swipe) {
            return swipe;
        }
        if (typeof message?.mes === 'string') {
            return message.mes;
        }
        if (typeof message?.message === 'string') {
            return message.message;
        }
        return '';
    }

    function getMessageRole(message) {
        if (message?.role) {
            return String(message.role);
        }
        if (message?.is_user) {
            return 'user';
        }
        if (message?.is_system) {
            return 'system';
        }
        return 'assistant';
    }

    function isMessageHidden(message) {
        return Boolean(
            message?.is_hidden
            || message?.is_system
            || message?.hide_message
            || message?.extra?.is_hidden
            || message?.extra?.hide_message
        );
    }

    function mapContextMessage(message, fallbackId) {
        return {
            id: fallbackId,
            name: message?.name || '',
            role: getMessageRole(message),
            hidden: isMessageHidden(message),
            text: getMessageText(message),
        };
    }

    function toFiniteInteger(value, fallback = null) {
        const number = Number(value);
        return Number.isInteger(number) ? number : fallback;
    }

    async function readMessagesFromTavernHelper() {
        const helper = globalThis.TavernHelper;
        const getChatMessages = typeof helper?.getChatMessages === 'function'
            ? helper.getChatMessages.bind(helper)
            : (typeof globalThis.getChatMessages === 'function' ? globalThis.getChatMessages.bind(globalThis) : null);

        if (!getChatMessages) {
            return null;
        }

        try {
            const messages = await getChatMessages('0-{{lastMessageId}}', {
                hide_state: 'all',
                include_swipes: true,
            });

            if (!Array.isArray(messages)) {
                return null;
            }

            return messages
                .map((message, index) => ({
                    id: toFiniteInteger(message?.message_id ?? message?.id, index),
                    name: message?.name || '',
                    role: message?.role || getMessageRole(message),
                    hidden: isMessageHidden(message),
                    text: getMessageText(message),
                }))
                .filter(message => Number.isInteger(message.id));
        } catch (error) {
            console.warn('[Chat Search Jump] Tavern Helper message read failed, using SillyTavern context when possible.', error);
            return null;
        }
    }

    async function readMessages() {
        const chat = getContext()?.chat;
        if (Array.isArray(chat)) {
            // Context indexes match the rendered .mes[mesid] value, so use them first for reliable jumping.
            return chat.map(mapContextMessage).filter(message => Number.isInteger(message.id));
        }

        const helperMessages = await readMessagesFromTavernHelper();
        return helperMessages || [];
    }

    function makeSnippet(text, query, caseSensitive) {
        const plain = collapseWhitespace(stripHtml(text));
        if (!plain) {
            return '';
        }

        const haystack = caseSensitive ? plain : plain.toLocaleLowerCase();
        const needle = caseSensitive ? query : query.toLocaleLowerCase();
        const index = needle ? haystack.indexOf(needle) : -1;
        const safeIndex = index >= 0 ? index : 0;
        const start = Math.max(0, safeIndex - 42);
        const end = Math.min(plain.length, safeIndex + Math.max(needle.length, 1) + 72);
        const prefix = start > 0 ? '...' : '';
        const suffix = end < plain.length ? '...' : '';
        const snippet = `${prefix}${plain.slice(start, end)}${suffix}`;

        if (index < 0 || !needle) {
            return escapeHtml(snippet);
        }

        const snippetHaystack = caseSensitive ? snippet : snippet.toLocaleLowerCase();
        const snippetIndex = snippetHaystack.indexOf(needle);
        if (snippetIndex < 0) {
            return escapeHtml(snippet);
        }

        return [
            escapeHtml(snippet.slice(0, snippetIndex)),
            '<mark>',
            escapeHtml(snippet.slice(snippetIndex, snippetIndex + needle.length)),
            '</mark>',
            escapeHtml(snippet.slice(snippetIndex + needle.length)),
        ].join('');
    }

    function makePlainPreview(text, maxLength = 160) {
        const plain = collapseWhitespace(stripHtml(text));
        if (!plain) {
            return '';
        }
        return plain.length > maxLength ? `${plain.slice(0, maxLength)}...` : plain;
    }

    function countOccurrences(text, query, caseSensitive) {
        const plain = normalize(text, caseSensitive);
        const needle = caseSensitive ? query : query.toLocaleLowerCase();
        if (!plain || !needle) {
            return 0;
        }

        let count = 0;
        let index = plain.indexOf(needle);
        while (index >= 0) {
            count += 1;
            index = plain.indexOf(needle, index + needle.length);
        }
        return count;
    }

    async function runSearch() {
        const token = ++state.searchToken;
        const settings = getSettings();
        const query = elements.input?.value?.trim() ?? '';
        state.query = query;

        if (!query) {
            state.results = [];
            state.activeIndex = -1;
            state.activeOccurrence = 0;
            renderPanelList();
            return;
        }

        state.mode = 'search';
        setActiveTab();
        elements.status.textContent = '搜索中...';

        const messages = await readMessages();
        if (token !== state.searchToken) {
            return;
        }

        const needle = normalize(query, settings.caseSensitive);
        const results = [];

        for (const message of messages) {
            if (!settings.includeHidden && message.hidden) {
                continue;
            }

            const searchable = settings.includeNames ? `${message.name}\n${message.text}` : message.text;
            if (!normalize(searchable, settings.caseSensitive).includes(needle)) {
                continue;
            }

            const textMatchCount = countOccurrences(message.text, query, settings.caseSensitive);
            const snippetHtml = makeSnippet(searchable, query, settings.caseSensitive);
            results.push({
                id: message.id,
                name: message.name || roleLabel(message.role),
                role: message.role || '',
                hidden: message.hidden,
                matchCount: Math.max(1, textMatchCount),
                snippet: snippetHtml,
                preview: makePlainPreview(snippetHtml) || makePlainPreview(searchable) || `第 ${message.id} 楼`,
            });

            if (results.length >= settings.maxResults) {
                break;
            }
        }

        state.results = results;
        state.activeIndex = results.length ? 0 : -1;
        state.activeOccurrence = 0;
        renderPanelList();
    }

    let searchTimeout = null;
    function scheduleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    }

    function getFallbackFavoriteStore() {
        if (fallbackFavoriteStore) {
            return fallbackFavoriteStore;
        }

        try {
            fallbackFavoriteStore = JSON.parse(localStorage.getItem(`${ID}-favorites`) || '{}');
        } catch {
            fallbackFavoriteStore = {};
        }

        if (!Array.isArray(fallbackFavoriteStore.favorites)) {
            fallbackFavoriteStore.favorites = [];
        }
        return fallbackFavoriteStore;
    }

    function getFavoriteStore() {
        const context = getContext();
        const metadata = context?.chatMetadata;
        if (!metadata) {
            return getFallbackFavoriteStore();
        }

        if (!metadata[METADATA_KEY] || typeof metadata[METADATA_KEY] !== 'object') {
            metadata[METADATA_KEY] = { favorites: [] };
        }
        if (!Array.isArray(metadata[METADATA_KEY].favorites)) {
            metadata[METADATA_KEY].favorites = [];
        }
        return metadata[METADATA_KEY];
    }

    function getFavorites() {
        return getFavoriteStore().favorites;
    }

    function normalizeFavoriteId(id) {
        return String(toFiniteInteger(id, id));
    }

    function findFavorite(id) {
        const key = normalizeFavoriteId(id);
        return getFavorites().find(item => normalizeFavoriteId(item.id) === key) || null;
    }

    function isFavorite(id) {
        return Boolean(findFavorite(id));
    }

    async function persistFavorites() {
        const context = getContext();
        try {
            if (context?.chatMetadata && typeof context.saveMetadata === 'function') {
                await context.saveMetadata();
                return;
            }
            localStorage.setItem(`${ID}-favorites`, JSON.stringify(getFallbackFavoriteStore()));
        } catch (error) {
            console.warn('[Chat Search Jump] Failed to save favorites.', error);
        }
    }

    function favoriteFromResult(result) {
        return {
            id: result.id,
            name: result.name || '',
            role: result.role || '',
            hidden: Boolean(result.hidden),
            preview: result.preview || makePlainPreview(result.snippet) || `第 ${result.id} 楼`,
            query: state.query || '',
            createdAt: Date.now(),
        };
    }

    async function addFavoriteFromResult(result) {
        if (!result) {
            return;
        }

        const store = getFavoriteStore();
        const key = normalizeFavoriteId(result.id);
        const favorite = favoriteFromResult(result);
        const index = store.favorites.findIndex(item => normalizeFavoriteId(item.id) === key);

        if (index >= 0) {
            store.favorites[index] = {
                ...store.favorites[index],
                ...favorite,
                updatedAt: Date.now(),
            };
        } else {
            store.favorites.unshift(favorite);
        }

        await persistFavorites();
        globalThis.toastr?.success?.(`已收藏第 ${result.id} 楼`, 'Chat Search Jump');
    }

    async function removeFavorite(id) {
        const store = getFavoriteStore();
        const key = normalizeFavoriteId(id);
        const before = store.favorites.length;
        store.favorites = store.favorites.filter(item => normalizeFavoriteId(item.id) !== key);

        if (store.favorites.length !== before) {
            await persistFavorites();
            globalThis.toastr?.info?.(`已取消收藏第 ${id} 楼`, 'Chat Search Jump');
        }
    }

    async function toggleFavoriteFromResult(result) {
        if (!result) {
            return;
        }

        if (isFavorite(result.id)) {
            await removeFavorite(result.id);
        } else {
            await addFavoriteFromResult(result);
        }
        renderPanelList();
        updateToolPanelFavoriteCount();
    }

    async function clearFavorites() {
        const store = getFavoriteStore();
        if (!store.favorites.length) {
            return;
        }

        if (!globalThis.confirm?.('确定清空当前聊天的全部收藏吗？')) {
            return;
        }

        store.favorites = [];
        await persistFavorites();
        renderPanelList();
        updateToolPanelFavoriteCount();
        globalThis.toastr?.success?.('已清空当前聊天收藏', 'Chat Search Jump');
    }

    function renderSearchList() {
        const count = state.results.length;
        const activeResult = state.results[state.activeIndex];
        const hitCount = activeResult?.matchCount ?? 0;
        const truncated = count >= getSettings().maxResults ? '+' : '';

        elements.status.textContent = state.query ? `${count}${truncated} 条结果` : '输入关键词';
        elements.prev.disabled = count === 0;
        elements.next.disabled = count === 0;
        elements.hitPrev.disabled = hitCount <= 1;
        elements.hitNext.disabled = hitCount <= 1;
        elements.hitStatus.textContent = hitCount ? `命中 ${Math.min(state.activeOccurrence + 1, hitCount)}/${hitCount}` : '命中 0/0';
        elements.hitNav.hidden = hitCount <= 1;
        elements.clearFavorites.hidden = true;

        if (!count) {
            elements.list.innerHTML = state.query
                ? '<div class="stcsj-empty">没有找到</div>'
                : '<div class="stcsj-empty">搜索当前聊天记录</div>';
            return;
        }

        elements.list.innerHTML = state.results.map((result, index) => {
            const favorite = isFavorite(result.id);
            const active = index === state.activeIndex ? ' active' : '';
            const hidden = result.hidden ? '<span class="stcsj-badge">hidden</span>' : '';
            return `
                <div class="stcsj-result-row">
                    <button type="button" class="stcsj-result${active}" data-stcsj-action="jump-result" data-index="${index}">
                        <span class="stcsj-result-meta">
                            <span>#${escapeHtml(result.id)}</span>
                            <span>${escapeHtml(result.name)}</span>
                            <span>命中 ${escapeHtml(result.matchCount)}</span>
                            ${hidden}
                        </span>
                        <span class="stcsj-result-snippet">${result.snippet}</span>
                    </button>
                    <button type="button" class="stcsj-icon-btn stcsj-result-fav${favorite ? ' active' : ''}" data-stcsj-action="toggle-favorite" data-index="${index}" title="${favorite ? '取消收藏' : '收藏这层'}" aria-label="${favorite ? '取消收藏' : '收藏这层'}">
                        <i class="${favorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                    </button>
                </div>`;
        }).join('');
    }

    function renderFavoriteList() {
        const favorites = getFavorites();
        elements.status.textContent = `已收藏 ${favorites.length} 条`;
        elements.prev.disabled = true;
        elements.next.disabled = true;
        elements.hitPrev.disabled = true;
        elements.hitNext.disabled = true;
        elements.hitStatus.textContent = '命中 0/0';
        elements.hitNav.hidden = true;
        elements.clearFavorites.hidden = favorites.length === 0;

        if (!favorites.length) {
            elements.list.innerHTML = '<div class="stcsj-empty">还没有收藏。先在搜索结果右侧点星标。</div>';
            return;
        }

        elements.list.innerHTML = favorites.map(favorite => {
            const hidden = favorite.hidden ? '<span class="stcsj-badge">hidden</span>' : '';
            const date = favorite.createdAt ? new Date(favorite.createdAt).toLocaleString() : '';
            return `
                <div class="stcsj-result-row">
                    <button type="button" class="stcsj-result stcsj-favorite-item" data-stcsj-action="jump-favorite" data-id="${escapeHtml(favorite.id)}">
                        <span class="stcsj-result-meta">
                            <span>#${escapeHtml(favorite.id)}</span>
                            <span>${escapeHtml(favorite.name || roleLabel(favorite.role))}</span>
                            ${date ? `<span>${escapeHtml(date)}</span>` : ''}
                            ${hidden}
                        </span>
                        <span class="stcsj-result-snippet">${escapeHtml(favorite.preview || `第 ${favorite.id} 楼`)}</span>
                    </button>
                    <button type="button" class="stcsj-icon-btn stcsj-result-fav active" data-stcsj-action="remove-favorite" data-id="${escapeHtml(favorite.id)}" title="取消收藏" aria-label="取消收藏">
                        <i class="fa-solid fa-star"></i>
                    </button>
                </div>`;
        }).join('');
    }

    function updateFavoriteCount() {
        if (elements.favoriteCount) {
            elements.favoriteCount.textContent = String(getFavorites().length);
        }
    }

    function setActiveTab() {
        if (!elements.searchTab || !elements.favoriteTab) {
            return;
        }

        elements.searchTab.classList.toggle('active', state.mode === 'search');
        elements.favoriteTab.classList.toggle('active', state.mode === 'favorites');
    }

    function renderPanelList() {
        setActiveTab();
        updateFavoriteCount();
        if (!elements.list) {
            return;
        }

        if (state.mode === 'favorites') {
            renderFavoriteList();
        } else {
            renderSearchList();
        }
    }

    function bindToolPanelCoreButtons() {
        elements.toolPanel.querySelector(`#${ID}-open-search`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('search');
        });
        elements.toolPanel.querySelector(`#${ID}-open-favorites`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('favorites');
        });
    }

    function renderToolPanelLoading() {
        elements.toolPanel.innerHTML = `
            <div class="stcsj-tool-title"><span><i class="fa-solid fa-wand-magic-sparkles"></i> 酒馆工具</span></div>
            <button type="button" class="stcsj-tool-action" id="${ID}-open-search"><i class="fa-solid fa-magnifying-glass"></i><span>聊天搜索</span><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="stcsj-tool-action" id="${ID}-open-favorites"><i class="fa-solid fa-star"></i><span>收藏消息</span><strong class="stcsj-tool-count stcsj-favorite-count">${getFavorites().length}</strong></button>
            <div class="stcsj-tool-section-title">API / 预设保护</div>
            ${getApiGuardStatusHtml()}
            <div class="stcsj-tool-empty">读取配置中...</div>`;

        bindToolPanelCoreButtons();
    }

    async function renderToolPanel() {
        renderToolPanelLoading();
        const [profiles, current, currentPreset] = await Promise.all([getProfiles(), getCurrentProfile(), getCurrentPresetName()]);
        if (!state.toolsOpen) {
            return;
        }

        state.currentProfile = current;
        state.currentPreset = currentPreset;
        updateToolBallTitle();

        const settings = getSettings();
        const presetBoundCount = countPresetBoundProfiles();
        const apiOnlyChecked = checkedAttribute(settings.apiOnlySwitching);
        const decoupleChecked = checkedAttribute(settings.decouplePresetConnection);
        const lockChecked = checkedAttribute(settings.lockApiProfile);
        const apiModeText = settings.apiOnlySwitching ? 'API-only：不改预设' : '完整 Profile：会按配置切预设';
        const lockedProfileText = settings.lockApiProfile && settings.lockedProfile ? settings.lockedProfile : '未锁定';

        const profileHtml = profiles.length
            ? profiles.map(name => {
                const active = name === current;
                return `
                    <button type="button" class="stcsj-profile-item${active ? ' active' : ''}" data-profile="${escapeHtml(name)}">
                        <span>${escapeHtml(name)}</span>
                        <i class="fa-solid ${active ? 'fa-check' : 'fa-rotate'}"></i>
                    </button>`;
            }).join('')
            : '<div class="stcsj-tool-empty">没有找到连接配置。请确认 Connection Profiles 已启用。</div>';

        elements.toolPanel.innerHTML = `
            <div class="stcsj-tool-title"><span><i class="fa-solid fa-wand-magic-sparkles"></i> 酒馆工具</span></div>
            <button type="button" class="stcsj-tool-action" id="${ID}-open-search"><i class="fa-solid fa-magnifying-glass"></i><span>聊天搜索</span><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="stcsj-tool-action" id="${ID}-open-favorites"><i class="fa-solid fa-star"></i><span>收藏消息</span><strong class="stcsj-tool-count stcsj-favorite-count">${getFavorites().length}</strong></button>
            <div class="stcsj-tool-section-title">API / 预设保护</div>
            <div class="stcsj-current-profile"><span>当前 API</span><strong>${escapeHtml(current || '未知')}</strong></div>
            <div class="stcsj-current-profile"><span>当前预设</span><strong>${escapeHtml(currentPreset || '未知')}</strong></div>
            ${getApiGuardStatusHtml()}
            <label class="stcsj-tool-toggle" title="开启后，会关闭 SillyTavern 的 Chat Completion 预设/API绑定，并在预设切换事件里剥离连接字段。">
                <input type="checkbox" id="${ID}-decouple-native"${decoupleChecked}>
                <span>切预设不改 API</span>
            </label>
            <label class="stcsj-tool-toggle" title="开启后，点下面 Profile 只应用 API / URL / 模型 / 代理 / 密钥，不应用 Settings Preset。">
                <input type="checkbox" id="${ID}-api-only-switch"${apiOnlyChecked}>
                <span>${escapeHtml(apiModeText)}</span>
            </label>
            <label class="stcsj-tool-toggle" title="切预设或外部操作导致 API Profile 改变时，自动拉回锁定的 Profile。">
                <input type="checkbox" id="${ID}-lock-profile"${lockChecked}>
                <span>锁定当前 API Profile：${escapeHtml(lockedProfileText)}</span>
            </label>
            <button type="button" class="stcsj-tool-action" id="${ID}-lock-current-profile"><i class="fa-solid fa-lock"></i><span>把当前 API 设为锁定</span><i class="fa-solid fa-check"></i></button>
            <div class="stcsj-tool-note">默认用三层保护：关闭官方绑定、切 Profile 只套 API 字段、必要时拉回锁定 API。</div>
            <button type="button" class="stcsj-tool-action" id="${ID}-decouple-profiles"><i class="fa-solid fa-link-slash"></i><span>解绑已有 Profile 的预设</span><strong class="stcsj-tool-count stcsj-profile-preset-count">${presetBoundCount}</strong></button>
            <div class="stcsj-profile-list">${profileHtml}</div>
            <button type="button" class="stcsj-tool-refresh" id="${ID}-refresh-profiles"><i class="fa-solid fa-rotate-right"></i><span>刷新</span></button>`;

        elements.toolPanel.querySelector(`#${ID}-open-search`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('search');
        });
        elements.toolPanel.querySelector(`#${ID}-open-favorites`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('favorites');
        });
        elements.toolPanel.querySelector(`#${ID}-decouple-native`)?.addEventListener('change', async event => {
            await setPresetConnectionDecouple(event.currentTarget.checked);
            await renderToolPanel();
        });
        elements.toolPanel.querySelector(`#${ID}-api-only-switch`)?.addEventListener('change', event => {
            const settings = getSettings();
            settings.apiOnlySwitching = Boolean(event.currentTarget.checked);
            saveSettings();
            renderToolPanel();
        });
        elements.toolPanel.querySelector(`#${ID}-lock-profile`)?.addEventListener('change', async event => {
            await setApiProfileLock(event.currentTarget.checked);
            await renderToolPanel();
        });
        elements.toolPanel.querySelector(`#${ID}-lock-current-profile`)?.addEventListener('click', async () => {
            await setLockedProfileToCurrent({ notify: true });
            await renderToolPanel();
        });
        elements.toolPanel.querySelector(`#${ID}-decouple-profiles`)?.addEventListener('click', async () => {
            await decouplePresetFromConnectionProfiles();
            await ensurePresetConnectionDecoupled({ notify: false, triggerUi: true });
            await renderToolPanel();
        });
        elements.toolPanel.querySelector(`#${ID}-refresh-profiles`)?.addEventListener('click', renderToolPanel);
        elements.toolPanel.querySelectorAll('.stcsj-profile-item').forEach(item => {
            item.addEventListener('click', async () => {
                const name = item.getAttribute('data-profile');
                const settings = getSettings();
                if (!name || (name === state.currentProfile && !settings.apiOnlySwitching)) {
                    closeToolPanel();
                    return;
                }

                item.classList.add('loading');
                suppressProfileRestore(4000);
                if (settings.apiOnlySwitching) {
                    await switchProfileApiOnly(name);
                    state.currentProfile = await getCurrentProfile() || name;
                    state.currentPreset = await getCurrentPresetName();
                    const profile = await getConnectionProfileDetails(name);
                    updateToolBallTitle();
                    globalThis.toastr?.success?.(`已切换 API，不改预设：${name}${profile ? `（${describeApiOnlyProfile(profile)}）` : ''}`, 'SillyTavern Tool Ball');
                } else {
                    await switchProfile(name);
                    await ensurePresetConnectionDecoupled({ notify: false });
                    state.currentProfile = await getCurrentProfile() || name;
                    state.currentPreset = await getCurrentPresetName();
                    updateToolBallTitle();
                    globalThis.toastr?.success?.(`已完整切换到：${name}`, 'SillyTavern Tool Ball');
                }

                const latestSettings = getSettings();
                if (latestSettings.lockApiProfile) {
                    latestSettings.lockedProfile = state.currentProfile || name;
                    saveSettings();
                }
                closeToolPanel();
            });
        });
    }

    function updateToolPanelFavoriteCount() {
        if (!elements.toolPanel) {
            return;
        }
        elements.toolPanel.querySelectorAll('.stcsj-favorite-count').forEach(node => {
            node.textContent = String(getFavorites().length);
        });
    }

    function findMessageElement(messageId) {
        const id = cssEscape(messageId);
        const selectors = [
            `.mes[mesid="${id}"]`,
            `.mes[data-message-id="${id}"]`,
            `.mes[data-mes-id="${id}"]`,
            `[mesid="${id}"].mes`,
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }

    function getMessageIdFromElement(element) {
        const raw = element?.getAttribute?.('mesid')
            ?? element?.getAttribute?.('data-message-id')
            ?? element?.getAttribute?.('data-mes-id');
        const id = Number(raw);
        return Number.isInteger(id) ? id : null;
    }

    function getRenderedMessageIds() {
        return Array.from(document.querySelectorAll('.mes[mesid], .mes[data-message-id], .mes[data-mes-id]'))
            .map(getMessageIdFromElement)
            .filter(Number.isInteger);
    }

    function getFirstRenderedMessageId() {
        const ids = getRenderedMessageIds();
        return ids.length ? Math.min(...ids) : null;
    }

    function isProbablyClickable(element) {
        if (!element) {
            return false;
        }
        if ('disabled' in element && element.disabled) {
            return false;
        }
        if (element.classList?.contains('disabled')) {
            return false;
        }
        const style = globalThis.getComputedStyle?.(element);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
            return false;
        }
        return true;
    }

    function getShowMoreButton() {
        const host = document.getElementById('show_more_messages');
        if (!host) {
            return null;
        }

        const nested = host.matches('button, [role="button"]')
            ? host
            : host.querySelector('button, [role="button"], .menu_button, .right_menu_button');

        if (isProbablyClickable(nested)) {
            return nested;
        }
        return isProbablyClickable(host) ? host : null;
    }

    function clickShowMore(button) {
        if (!button) {
            return false;
        }

        try {
            if (typeof globalThis.$ === 'function') {
                globalThis.$(button).trigger('click');
            } else {
                button.click();
            }
            return true;
        } catch (error) {
            try {
                button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return true;
            } catch (innerError) {
                console.warn('[Chat Search Jump] Failed to click #show_more_messages.', error, innerError);
                return false;
            }
        }
    }

    function getChatContainer() {
        return document.getElementById('chat')
            || document.querySelector('.chat')
            || document.querySelector('.mes')?.parentElement
            || document.body;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForMessageElement(messageId, timeout = 700) {
        const existing = findMessageElement(messageId);
        if (existing) {
            return existing;
        }

        if (!globalThis.MutationObserver) {
            await wait(timeout);
            return findMessageElement(messageId);
        }

        const container = getChatContainer();
        return new Promise(resolve => {
            let settled = false;
            const finish = element => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                observer.disconnect();
                resolve(element || null);
            };

            const observer = new MutationObserver(() => {
                const element = findMessageElement(messageId);
                if (element) {
                    finish(element);
                }
            });

            const timer = setTimeout(() => finish(findMessageElement(messageId)), timeout);
            observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['mesid', 'data-message-id', 'data-mes-id'] });
        });
    }

    async function ensureMessageRendered(messageId, onProgress = null) {
        let element = findMessageElement(messageId);
        if (element) {
            return element;
        }

        let lastFirstId = null;
        let stagnantLoads = 0;
        let noButtonWaits = 0;

        for (let attempt = 0; attempt < MAX_AUTO_LOAD_ATTEMPTS; attempt += 1) {
            const firstRenderedId = getFirstRenderedMessageId();
            const targetIsOlder = firstRenderedId === null || Number(messageId) < firstRenderedId;

            if (!targetIsOlder) {
                element = await waitForMessageElement(messageId, 300);
                if (element) {
                    return element;
                }
                break;
            }

            const showMore = getShowMoreButton();
            if (!showMore) {
                if (noButtonWaits < 6) {
                    noButtonWaits += 1;
                    await wait(500);
                    element = findMessageElement(messageId);
                    if (element) {
                        return element;
                    }
                    continue;
                }
                break;
            }

            noButtonWaits = 0;
            onProgress?.(attempt + 1, firstRenderedId);
            if (!clickShowMore(showMore)) {
                break;
            }

            element = await waitForMessageElement(messageId, 1100);
            if (element) {
                return element;
            }

            await wait(120);
            const nextFirstId = getFirstRenderedMessageId();
            if (nextFirstId === lastFirstId) {
                stagnantLoads += 1;
                if (stagnantLoads >= 4) {
                    await wait(500);
                }
            } else {
                stagnantLoads = 0;
            }
            lastFirstId = nextFirstId;
        }

        return findMessageElement(messageId);
    }

    function flashMessage(element) {
        document.querySelectorAll('.stcsj-hit').forEach(node => node.classList.remove('stcsj-hit'));
        element.classList.add('stcsj-hit');
        setTimeout(() => element.classList.remove('stcsj-hit'), 2400);
    }

    function clearOccurrenceHighlight() {
        if (globalThis.CSS?.highlights) {
            CSS.highlights.delete('stcsj-current-hit');
        }
    }

    function getMessageSearchRoot(element) {
        return element.querySelector('.mes_text')
            || element.querySelector('.mes_block')
            || element;
    }

    function createRangeAt(root, start, end) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (parent?.closest('.stcsj-panel, .stcsj-tool-panel, script, style, textarea, input, button')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });

        let offset = 0;
        let startNode = null;
        let startOffset = 0;
        let endNode = null;
        let endOffset = 0;

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const value = node.nodeValue || '';
            const nextOffset = offset + value.length;

            if (!startNode && start >= offset && start <= nextOffset) {
                startNode = node;
                startOffset = start - offset;
            }
            if (!endNode && end >= offset && end <= nextOffset) {
                endNode = node;
                endOffset = end - offset;
                break;
            }

            offset = nextOffset;
        }

        if (!startNode || !endNode) {
            return null;
        }

        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
    }

    function findOccurrenceRanges(element, query, caseSensitive) {
        const root = getMessageSearchRoot(element);
        const text = root.textContent || '';
        const haystack = caseSensitive ? text : text.toLocaleLowerCase();
        const needle = caseSensitive ? query : query.toLocaleLowerCase();
        const ranges = [];

        if (!needle) {
            return ranges;
        }

        let index = haystack.indexOf(needle);
        while (index >= 0) {
            const range = createRangeAt(root, index, index + needle.length);
            if (range) {
                ranges.push(range);
            }
            index = haystack.indexOf(needle, index + needle.length);
        }

        return ranges;
    }

    function scrollRangeIntoView(range) {
        const rect = Array.from(range.getClientRects()).find(item => item.width || item.height);
        if (!rect) {
            return false;
        }

        window.scrollTo({
            top: Math.max(0, rect.top + window.scrollY - window.innerHeight * 0.42),
            behavior: 'smooth',
        });
        return true;
    }

    function highlightOccurrence(element, occurrenceIndex) {
        clearOccurrenceHighlight();
        const result = state.results[state.activeIndex];
        if (!result || !state.query) {
            return false;
        }

        const ranges = findOccurrenceRanges(element, state.query, getSettings().caseSensitive);
        if (!ranges.length) {
            return false;
        }

        const nextIndex = (occurrenceIndex + ranges.length) % ranges.length;
        state.activeOccurrence = nextIndex;
        result.matchCount = ranges.length;
        const range = ranges[nextIndex];

        if (globalThis.CSS?.highlights && globalThis.Highlight) {
            CSS.highlights.set('stcsj-current-hit', new Highlight(range));
        }

        scrollRangeIntoView(range);
        flashMessage(element);
        renderPanelList();
        return true;
    }

    async function jumpToMessageId(messageId, options = {}) {
        const token = ++state.jumpToken;
        const numericId = toFiniteInteger(messageId, messageId);
        const { resultIndex = null, occurrenceIndex = 0, highlight = false } = options;

        if (resultIndex !== null) {
            state.activeIndex = resultIndex;
            state.activeOccurrence = occurrenceIndex;
            state.mode = 'search';
            renderPanelList();
        }

        const progress = (attempt, firstRenderedId) => {
            if (token !== state.jumpToken) {
                return;
            }
            elements.status.textContent = firstRenderedId === null
                ? `正在加载第 ${numericId} 楼...`
                : `正在加载旧楼层：第 ${numericId} 楼，当前最早 ${firstRenderedId}`;
        };

        const element = await ensureMessageRendered(numericId, progress);
        if (token !== state.jumpToken) {
            return;
        }

        if (!element) {
            renderPanelList();
            globalThis.toastr?.warning?.(`找不到第 ${numericId} 楼。可能消息被隐藏、删除，或旧楼层加载按钮不可用。`, 'Chat Search Jump');
            return;
        }

        await wait(40);
        if (highlight && !highlightOccurrence(element, occurrenceIndex)) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            flashMessage(element);
        } else if (!highlight) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            flashMessage(element);
        }

        renderPanelList();
    }

    function jumpToResult(index, occurrenceIndex = 0) {
        const result = state.results[index];
        if (!result) {
            return;
        }
        jumpToMessageId(result.id, { resultIndex: index, occurrenceIndex, highlight: true });
    }

    function jumpRelative(delta) {
        if (!state.results.length) {
            return;
        }
        const nextIndex = (state.activeIndex + delta + state.results.length) % state.results.length;
        jumpToResult(nextIndex);
    }

    async function jumpOccurrence(delta) {
        const result = state.results[state.activeIndex];
        if (!result) {
            return;
        }

        const element = await ensureMessageRendered(result.id);
        if (!element) {
            return;
        }

        const nextOccurrence = (state.activeOccurrence + delta + result.matchCount) % result.matchCount;
        highlightOccurrence(element, nextOccurrence);
    }

    function openPanel(mode = 'search') {
        state.mode = mode;
        elements.panel.classList.add('open');
        elements.toggle.setAttribute('aria-expanded', 'true');
        renderPanelList();

        if (mode === 'search') {
            setTimeout(() => elements.input.focus(), 0);
            if (elements.input.value.trim()) {
                scheduleSearch();
            }
        }
    }

    function closePanel() {
        elements.panel.classList.remove('open');
        elements.toggle.setAttribute('aria-expanded', 'false');
    }

    function togglePanel() {
        if (elements.panel.classList.contains('open')) {
            closePanel();
        } else {
            openPanel('search');
        }
    }

    function toggleToolPanel() {
        if (state.toolsOpen) {
            closeToolPanel();
        } else {
            openToolPanel();
        }
    }

    function openToolPanel() {
        state.toolsOpen = true;
        elements.toolPanel.classList.add('open');
        elements.toggle.setAttribute('aria-expanded', 'true');
        positionToolPanel();
        renderToolPanel();
    }

    function closeToolPanel() {
        state.toolsOpen = false;
        elements.toolPanel.classList.remove('open');
        elements.toggle.setAttribute('aria-expanded', 'false');
    }

    function updateToolBallTitle() {
        const parts = ['酒馆工具'];
        if (state.currentProfile) {
            parts.push(`当前 API：${state.currentProfile}`);
        }
        if (state.currentPreset) {
            parts.push(`当前预设：${state.currentPreset}`);
        }
        elements.toggle.title = parts.join('｜');
    }

    function getBallSettings() {
        const settings = getSettings();
        if (typeof settings.ballX !== 'number') {
            settings.ballX = Math.max(12, window.innerWidth - 72);
        }
        if (typeof settings.ballY !== 'number') {
            settings.ballY = Math.round(window.innerHeight * 0.62);
        }
        return settings;
    }

    function setBallPosition(x, y) {
        elements.toggle.style.left = `${x}px`;
        elements.toggle.style.top = `${y}px`;
    }

    function clampToolBall() {
        const settings = getBallSettings();
        const width = elements.toggle.offsetWidth || 50;
        const height = elements.toggle.offsetHeight || 50;
        settings.ballX = Math.max(8, Math.min(settings.ballX, window.innerWidth - width - 8));
        settings.ballY = Math.max(8, Math.min(settings.ballY, window.innerHeight - height - 8));
        setBallPosition(settings.ballX, settings.ballY);
    }

    function positionToolPanel() {
        const settings = getBallSettings();
        const panelWidth = 306;
        const panelHeight = 460;
        const ballWidth = elements.toggle.offsetWidth || 50;
        let left = settings.ballX + ballWidth + 10;
        let top = settings.ballY - 10;

        if (left + panelWidth > window.innerWidth - 8) {
            left = settings.ballX - panelWidth - 10;
        }
        if (top + panelHeight > window.innerHeight - 8) {
            top = window.innerHeight - panelHeight - 8;
        }

        elements.toolPanel.style.left = `${Math.max(8, left)}px`;
        elements.toolPanel.style.top = `${Math.max(8, top)}px`;
    }

    function attachToolBallDrag() {
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;

        elements.toggle.addEventListener('pointerdown', event => {
            dragging = true;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            const settings = getBallSettings();
            originX = settings.ballX;
            originY = settings.ballY;
            elements.toggle.classList.add('dragging');
            try {
                elements.toggle.setPointerCapture(event.pointerId);
            } catch {
                // Ignore browsers that do not support pointer capture on this element.
            }
        });

        elements.toggle.addEventListener('pointermove', event => {
            if (!dragging) {
                return;
            }

            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                moved = true;
            }

            const settings = getBallSettings();
            settings.ballX = originX + dx;
            settings.ballY = originY + dy;
            clampToolBall();
            if (state.toolsOpen) {
                positionToolPanel();
            }
        });

        const endDrag = event => {
            if (!dragging) {
                return;
            }

            dragging = false;
            elements.toggle.classList.remove('dragging');
            try {
                elements.toggle.releasePointerCapture(event.pointerId);
            } catch {
                // Ignore browsers that do not support pointer capture on this element.
            }

            if (moved) {
                saveSettings();
            } else {
                toggleToolPanel();
            }
        };

        elements.toggle.addEventListener('pointerup', endDrag);
        elements.toggle.addEventListener('pointercancel', endDrag);
    }

    function syncSettingsToUi() {
        const settings = getSettings();
        elements.caseSensitive.checked = Boolean(settings.caseSensitive);
        elements.includeHidden.checked = Boolean(settings.includeHidden);
        elements.includeNames.checked = Boolean(settings.includeNames);
    }

    function createUi() {
        document.getElementById(`${ID}-toggle`)?.remove();
        document.getElementById(`${ID}-tool-panel`)?.remove();
        document.getElementById(`${ID}-panel`)?.remove();

        document.body.insertAdjacentHTML('beforeend', `
            <button type="button" id="${ID}-toggle" class="stcsj-tool-ball" title="酒馆工具" aria-label="酒馆工具" aria-expanded="false">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
            </button>
            <div id="${ID}-tool-panel" class="stcsj-tool-panel" aria-live="polite"></div>
            <section id="${ID}-panel" class="stcsj-panel" aria-label="聊天搜索">
                <div class="stcsj-header">
                    <label class="stcsj-search-field">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input id="${ID}-input" type="search" placeholder="输入关键词" autocomplete="off">
                    </label>
                    <button type="button" class="stcsj-icon-btn" id="${ID}-close" title="关闭" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="stcsj-options">
                    <label><input id="${ID}-case" type="checkbox"> 区分大小写</label>
                    <label><input id="${ID}-names" type="checkbox"> 搜索名字</label>
                    <label><input id="${ID}-hidden" type="checkbox"> 包含隐藏</label>
                </div>
                <div class="stcsj-tabs" role="tablist" aria-label="搜索与收藏">
                    <button type="button" class="stcsj-tab active" id="${ID}-tab-search" data-mode="search">搜索结果</button>
                    <button type="button" class="stcsj-tab" id="${ID}-tab-favorites" data-mode="favorites">收藏 <span id="${ID}-favorite-count">0</span></button>
                </div>
                <div class="stcsj-actions">
                    <button type="button" class="stcsj-icon-btn" id="${ID}-prev" title="上一条" aria-label="上一条"><i class="fa-solid fa-chevron-up"></i></button>
                    <span id="${ID}-status">输入关键词</span>
                    <button type="button" class="stcsj-text-btn" id="${ID}-clear-favorites" hidden>清空收藏</button>
                    <button type="button" class="stcsj-icon-btn" id="${ID}-next" title="下一条" aria-label="下一条"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
                <div class="stcsj-hit-nav" id="${ID}-hit-nav" hidden>
                    <button type="button" class="stcsj-icon-btn" id="${ID}-hit-prev" title="上一处命中" aria-label="上一处命中"><i class="fa-solid fa-arrow-left"></i></button>
                    <span id="${ID}-hit-status">命中 0/0</span>
                    <button type="button" class="stcsj-icon-btn" id="${ID}-hit-next" title="下一处命中" aria-label="下一处命中"><i class="fa-solid fa-arrow-right"></i></button>
                </div>
                <div class="stcsj-list" id="${ID}-list"><div class="stcsj-empty">搜索当前聊天记录</div></div>
            </section>`);

        elements.toggle = document.getElementById(`${ID}-toggle`);
        elements.toolPanel = document.getElementById(`${ID}-tool-panel`);
        elements.panel = document.getElementById(`${ID}-panel`);
        elements.input = document.getElementById(`${ID}-input`);
        elements.close = document.getElementById(`${ID}-close`);
        elements.caseSensitive = document.getElementById(`${ID}-case`);
        elements.includeHidden = document.getElementById(`${ID}-hidden`);
        elements.includeNames = document.getElementById(`${ID}-names`);
        elements.searchTab = document.getElementById(`${ID}-tab-search`);
        elements.favoriteTab = document.getElementById(`${ID}-tab-favorites`);
        elements.favoriteCount = document.getElementById(`${ID}-favorite-count`);
        elements.prev = document.getElementById(`${ID}-prev`);
        elements.next = document.getElementById(`${ID}-next`);
        elements.clearFavorites = document.getElementById(`${ID}-clear-favorites`);
        elements.hitNav = document.getElementById(`${ID}-hit-nav`);
        elements.hitPrev = document.getElementById(`${ID}-hit-prev`);
        elements.hitNext = document.getElementById(`${ID}-hit-next`);
        elements.hitStatus = document.getElementById(`${ID}-hit-status`);
        elements.status = document.getElementById(`${ID}-status`);
        elements.list = document.getElementById(`${ID}-list`);

        clampToolBall();
        attachToolBallDrag();
        syncSettingsToUi();
        updateFavoriteCount();

        elements.close.addEventListener('click', closePanel);
        elements.input.addEventListener('input', () => {
            state.mode = 'search';
            scheduleSearch();
        });
        elements.caseSensitive.addEventListener('change', () => setSetting('caseSensitive', elements.caseSensitive.checked));
        elements.includeHidden.addEventListener('change', () => setSetting('includeHidden', elements.includeHidden.checked));
        elements.includeNames.addEventListener('change', () => setSetting('includeNames', elements.includeNames.checked));
        elements.prev.addEventListener('click', () => jumpRelative(-1));
        elements.next.addEventListener('click', () => jumpRelative(1));
        elements.hitPrev.addEventListener('click', () => jumpOccurrence(-1));
        elements.hitNext.addEventListener('click', () => jumpOccurrence(1));
        elements.clearFavorites.addEventListener('click', clearFavorites);

        [elements.searchTab, elements.favoriteTab].forEach(tab => {
            tab.addEventListener('click', () => {
                state.mode = tab.dataset.mode === 'favorites' ? 'favorites' : 'search';
                renderPanelList();
            });
        });

        elements.list.addEventListener('click', event => {
            const actionElement = event.target.closest('[data-stcsj-action]');
            if (!actionElement || !elements.list.contains(actionElement)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const action = actionElement.dataset.stcsjAction;
            if (action === 'jump-result') {
                jumpToResult(Number(actionElement.dataset.index));
                return;
            }
            if (action === 'toggle-favorite') {
                toggleFavoriteFromResult(state.results[Number(actionElement.dataset.index)]);
                return;
            }
            if (action === 'jump-favorite') {
                jumpToMessageId(actionElement.dataset.id, { highlight: false });
                return;
            }
            if (action === 'remove-favorite') {
                removeFavorite(actionElement.dataset.id).then(() => {
                    renderPanelList();
                    updateToolPanelFavoriteCount();
                });
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.toolsOpen) {
                closeToolPanel();
                return;
            }
            if (event.key === 'Escape' && elements.panel.classList.contains('open')) {
                closePanel();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === 'f') {
                event.preventDefault();
                closeToolPanel();
                togglePanel();
                return;
            }
            if (!elements.panel.classList.contains('open') || state.mode !== 'search') {
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'g') {
                event.preventDefault();
                jumpRelative(event.shiftKey ? -1 : 1);
            }
        });

        document.addEventListener('pointerdown', event => {
            if (!state.toolsOpen) {
                return;
            }
            if (elements.toolPanel.contains(event.target) || elements.toggle.contains(event.target)) {
                return;
            }
            closeToolPanel();
        });

        window.addEventListener('resize', () => {
            clampToolBall();
            if (state.toolsOpen) {
                positionToolPanel();
            }
        });
    }

    function clearOnChatChange() {
        if (!elements.input) {
            return;
        }

        elements.input.value = '';
        state.query = '';
        state.results = [];
        state.activeIndex = -1;
        state.activeOccurrence = 0;
        state.mode = 'search';
        clearOccurrenceHighlight();
        renderPanelList();
        updateToolPanelFavoriteCount();
    }

    function subscribeToEvents() {
        const context = getContext();
        const eventTypes = context?.eventTypes ?? context?.event_types ?? {};
        const eventSource = context?.eventSource;
        if (!eventSource || typeof eventSource.on !== 'function') {
            return;
        }

        const on = (eventName, handler) => {
            const eventType = eventTypes[eventName];
            if (eventType) {
                eventSource.on(eventType, handler);
            }
        };

        on('OAI_PRESET_CHANGED_BEFORE', stripConnectionFieldsFromPresetEvent);
        on('OAI_PRESET_CHANGED_AFTER', handlePresetChangedForApiGuard);
        on('PRESET_CHANGED', handlePresetChangedForApiGuard);
        on('CONNECTION_PROFILE_LOADED', () => {
            applyOfficialPresetConnectionDecouple();
            getCurrentProfile().then(profile => {
                state.currentProfile = profile;
                updateToolBallTitle();
            });
        });
        on('SETTINGS_UPDATED', () => {
            applyOfficialPresetConnectionDecouple();
            if (state.toolsOpen) {
                renderToolPanel();
            }
        });
        on('MAIN_API_CHANGED', handlePresetChangedForApiGuard);
        on('CHATCOMPLETION_SOURCE_CHANGED', handlePresetChangedForApiGuard);
        on('CHATCOMPLETION_MODEL_CHANGED', handlePresetChangedForApiGuard);
        on('CHAT_CHANGED', clearOnChatChange);
        on('MESSAGE_EDITED', scheduleSearch);
        on('MESSAGE_DELETED', scheduleSearch);
        on('MESSAGE_SWIPED', scheduleSearch);
        on('MESSAGE_UPDATED', scheduleSearch);
        on('USER_MESSAGE_RENDERED', scheduleSearch);
        on('CHARACTER_MESSAGE_RENDERED', scheduleSearch);
    }

    function init() {
        if (state.initialized) {
            return;
        }

        state.initialized = true;
        createUi();
        subscribeToEvents();

        ensurePresetConnectionDecoupled({ notify: false, triggerUi: true })
            .then(seedLockedProfileIfNeeded)
            .catch(error => console.warn('[SillyTavern Tool Ball] Failed to initialize API guard.', error));

        Promise.all([getCurrentProfile(), getCurrentPresetName()]).then(([profile, preset]) => {
            state.currentProfile = profile;
            state.currentPreset = preset;
            updateToolBallTitle();
        });

        window.setInterval(async () => {
            await ensurePresetConnectionDecoupled({ notify: false });
            state.currentProfile = await getCurrentProfile();
            state.currentPreset = await getCurrentPresetName();
            updateToolBallTitle();
        }, 30000);

        console.info('[Chat Search Jump] loaded');
    }

    function waitForSillyTavern(attempt = 0) {
        const context = getContext();
        const eventTypes = context?.eventTypes ?? context?.event_types;
        if (context?.eventSource && eventTypes?.APP_READY) {
            context.eventSource.on(eventTypes.APP_READY, init);
            setTimeout(init, 800);
            return;
        }

        if ((context?.chat || context?.extensionSettings) && document.body) {
            init();
            return;
        }

        if (attempt > 80) {
            console.warn('[Chat Search Jump] SillyTavern context was not found.');
            return;
        }

        setTimeout(() => waitForSillyTavern(attempt + 1), 250);
    }

    waitForSillyTavern();
})();
