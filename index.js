(() => {
    'use strict';

    const MODULE_NAME = 'chat_search_jump';
    const METADATA_KEY = 'chat_search_jump_favorites_v2';
    const ID = 'st-chat-search-jump';
    const CONNECTION_MANAGER_KEY = 'connectionManager';
    const MAX_AUTO_LOAD_ATTEMPTS = 120;
    const SEARCH_DEBOUNCE_MS = 120;
    const API_GUARD_ENFORCE_MS = 2500;
    const PROFILE_LOCK_POLL_MS = 5000;
    const OPENAI_MODULE_PATHS = Object.freeze(['/scripts/openai.js', './scripts/openai.js', '../scripts/openai.js']);
    const CORE_MODULE_PATHS = Object.freeze(['/script.js', './script.js', '../script.js']);
    const SNAPSHOT_RADIUS = 3;
    const SNAPSHOT_TEXT_LIMIT = 2200;

    const DEFAULT_SETTINGS = Object.freeze({
        caseSensitive: false,
        includeHidden: true,
        includeNames: true,
        maxResults: 300,
        ballX: null,
        ballY: null,
        decouplePresetConnection: true,
        lockApiProfile: true,
        lockedProfile: '',
    });

    const fallbackSettings = { ...DEFAULT_SETTINGS };
    let fallbackFavoriteStore = null;

    const state = {
        query: '',
        results: [],
        messages: [],
        activeIndex: -1,
        activeOccurrence: 0,
        initialized: false,
        toolsOpen: false,
        mode: 'search',
        currentProfile: '',
        searchToken: 0,
        jumpToken: 0,
        apiSwitching: false,
        profileRestoreTimer: null,
        suppressProfileRestoreUntil: 0,
        presetGuardActiveUntil: 0,
        profileSyncTimer: null,
        openAiModulePromise: null,
        coreModulePromise: null,
        nativePresetBindKnown: null,
        nativeModuleWarningShown: false,
        snapshotToken: 0,
        snapshotTargetId: null,
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

        // API / preset 解耦和当前连接保护是后台默认行为，不再暴露前端开关。
        settings.decouplePresetConnection = true;
        settings.lockApiProfile = true;

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

    function describeConnectionProfile(profile) {
        if (!profile) {
            return '';
        }

        const parts = [profile.api, profile['api-url'], profile.model]
            .map(value => String(value ?? '').trim())
            .filter(Boolean);
        return parts.length ? parts.join(' / ') : 'API 设置';
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

    function getProfileField(profile, key) {
        return String(profile?.[key] ?? '').trim();
    }

    function setElementValue(selector, value, { emit = true } = {}) {
        const element = document.querySelector(selector);
        if (!element) {
            return false;
        }

        element.value = String(value ?? '');
        if (emit) {
            emitInputAndChange(element);
        }
        return true;
    }

    async function syncCustomOpenAiFields(profile) {
        if (getProfileField(profile, 'api') !== 'custom') {
            return;
        }

        const apiUrl = getProfileField(profile, 'api-url');
        const model = getProfileField(profile, 'model');
        const module = await getOpenAiModule();

        const proxySelect = document.querySelector('#openai_proxy_preset');
        if (proxySelect && Array.from(proxySelect.options || []).some(option => option.value === 'None')) {
            proxySelect.value = 'None';
            emitInputAndChange(proxySelect);
        } else {
            setElementValue('#openai_reverse_proxy_name', 'None', { emit: false });
            setElementValue('#openai_reverse_proxy', '');
            setElementValue('#openai_proxy_password', '');
            if (module?.oai_settings) {
                module.oai_settings.reverse_proxy = '';
                module.oai_settings.proxy_password = '';
            }
        }

        if (apiUrl) {
            if (module?.oai_settings) {
                module.oai_settings.custom_url = apiUrl;
                module.oai_settings.reverse_proxy = '';
            }
            setElementValue('#custom_api_url_text', apiUrl);
            setElementValue('#openai_reverse_proxy', '');
        }

        if (model) {
            if (module?.oai_settings) {
                module.oai_settings.custom_model = model;
            }
            setElementValue('#custom_model_id', model);
        }
    }

    async function applyConnectionProfileFields(profile) {
        if (!profile) {
            return '';
        }

        const api = getProfileField(profile, 'api');
        const apiUrl = getProfileField(profile, 'api-url');
        const model = getProfileField(profile, 'model');
        const secretId = getProfileField(profile, 'secret-id');

        state.apiSwitching = true;
        suppressProfileRestore(7000);
        try {
            await enforcePresetConnectionDecouple();

            if (api) {
                await runSlashCommand(`/api quiet=true ${quoteSlashArg(api)}`);
            }

            if (apiUrl) {
                const apiArg = api ? ` api=${quoteSlashArg(api)}` : '';
                await runSlashCommand(`/api-url${apiArg} connect=false quiet=true ${quoteSlashArg(apiUrl)}`);
            }

            if (model) {
                await runSlashCommand(`/model quiet=true ${quoteSlashArg(model)}`);
            }

            await syncCustomOpenAiFields(profile);

            if (secretId) {
                await runSlashCommand(`/secret-id quiet=true ${quoteSlashArg(secretId)}`);
            }

            await markConnectionProfileSelected(profile);

            if (api === 'custom') {
                document.querySelector('#api_button_openai')?.click();
            }

            await enforcePresetConnectionDecouple();
            return profile.name || '';
        } finally {
            setTimeout(() => {
                state.apiSwitching = false;
            }, 1000);
        }
    }

    async function applyConnectionProfileByName(name) {
        const profile = await getConnectionProfileDetails(name);
        if (!profile) {
            globalThis.toastr?.warning?.(`没有找到连接配置：${name}`, 'SillyTavern Tool Ball');
            return '';
        }
        return applyConnectionProfileFields(profile);
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

    const OFFICIAL_PRESET_CONNECTION_BIND_ID = 'bind_preset_to_connection';

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
            console.warn('[Chat Search Jump] Failed to emit native input/change events.', error);
        }

        try {
            if (typeof globalThis.$ === 'function') {
                globalThis.$(element).trigger('input').trigger('change');
            }
        } catch (error) {
            console.warn('[Chat Search Jump] Failed to emit jQuery input/change events.', error);
        }
    }

    async function getOpenAiModule() {
        if (!state.openAiModulePromise) {
            state.openAiModulePromise = (async () => {
                let lastError = null;
                for (const path of OPENAI_MODULE_PATHS) {
                    try {
                        const module = await import(path);
                        if (module?.oai_settings) {
                            return module;
                        }
                    } catch (error) {
                        lastError = error;
                    }
                }
                throw lastError || new Error('SillyTavern openai.js module not found.');
            })();
        }

        try {
            return await state.openAiModulePromise;
        } catch (error) {
            state.openAiModulePromise = null;
            if (!state.nativeModuleWarningShown) {
                state.nativeModuleWarningShown = true;
                console.warn('[Chat Search Jump] Failed to access SillyTavern openai.js. DOM/event guards will still run.', error);
            }
            return null;
        }
    }

    async function setNativePresetConnectionBind(enabled) {
        const module = await getOpenAiModule();
        if (!module?.oai_settings || !hasOwn(module.oai_settings, 'bind_preset_to_connection')) {
            return { available: false, changed: false };
        }

        const desired = Boolean(enabled);
        const changed = module.oai_settings.bind_preset_to_connection !== desired;
        module.oai_settings.bind_preset_to_connection = desired;
        state.nativePresetBindKnown = desired;
        if (changed) {
            saveSettings();
        }
        return { available: true, changed };
    }

    async function enforcePresetConnectionDecouple({ notify = false } = {}) {
        const domResult = applyOfficialPresetConnectionDecouple({ notify: false });
        const nativeResult = await setNativePresetConnectionBind(false);

        if (notify && (domResult.changed || nativeResult.changed)) {
            globalThis.toastr?.success?.('已关闭“预设绑定 API 连接”', 'SillyTavern Tool Ball');
        }

        return {
            available: domResult.available || nativeResult.available,
            changed: domResult.changed || nativeResult.changed,
        };
    }

    function applyOfficialPresetConnectionDecouple({ notify = false } = {}) {
        const settings = getSettings();
        if (!settings.decouplePresetConnection) {
            return { available: Boolean(getPresetConnectionBindCheckbox()), changed: false };
        }

        const checkbox = getPresetConnectionBindCheckbox();
        if (!checkbox) {
            return { available: false, changed: false };
        }

        if (!checkbox.checked) {
            state.nativePresetBindKnown = false;
            return { available: true, changed: false };
        }

        checkbox.checked = false;
        state.nativePresetBindKnown = false;
        emitInputAndChange(checkbox);

        if (notify) {
            globalThis.toastr?.success?.('已关闭“预设绑定 API 连接”', 'SillyTavern Tool Ball');
        }

        return { available: true, changed: true };
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

        await enforcePresetConnectionDecouple();

        const current = await getCurrentProfile();
        if (!current) {
            return;
        }

        state.currentProfile = current;
        updateToolBallTitle();

        if (current === settings.lockedProfile) {
            return;
        }

        suppressProfileRestore(7000);
        await applyConnectionProfileByName(settings.lockedProfile);
        const restored = await getCurrentProfile();
        state.currentProfile = restored || settings.lockedProfile;
        updateToolBallTitle();

        if (state.toolsOpen) {
            renderToolPanel();
        }

        console.info(`[Chat Search Jump] Restored locked profile after ${reason}:`, settings.lockedProfile);
        globalThis.toastr?.info?.(`已保持 API 配置：${settings.lockedProfile}`, 'SillyTavern Tool Ball');
    }

    async function syncLockedProfileToCurrent(reason = 'manual API changed') {
        const settings = getSettings();
        if (!settings.decouplePresetConnection || !settings.lockApiProfile || state.apiSwitching) {
            return;
        }

        const current = await getCurrentProfile();
        if (!current) {
            return;
        }

        state.currentProfile = current;
        if (settings.lockedProfile !== current) {
            settings.lockedProfile = current;
            saveSettings();
            console.info(`[Chat Search Jump] Updated hidden API lock after ${reason}:`, current);
        }
        updateToolBallTitle();

        if (state.toolsOpen) {
            renderToolPanel();
        }
    }

    function scheduleLockedProfileSync(reason = 'manual API changed') {
        clearTimeout(state.profileSyncTimer);
        state.profileSyncTimer = setTimeout(() => {
            syncLockedProfileToCurrent(reason).catch(error => {
                console.warn('[Chat Search Jump] Failed to update hidden API lock.', error);
            });
        }, 500);
    }

    function scheduleLockedProfileRestore(reason = 'preset changed') {
        clearTimeout(state.profileRestoreTimer);
        state.profileRestoreTimer = setTimeout(() => {
            restoreLockedProfileIfNeeded(reason).catch(error => {
                console.warn('[Chat Search Jump] Failed to restore locked profile.', error);
            });
        }, 450);
    }

    function stripConnectionFieldsFromPresetEvent(eventData) {
        const settings = getSettings();
        if (!settings.decouplePresetConnection || !eventData) {
            return;
        }

        state.presetGuardActiveUntil = Date.now() + 5000;

        if (eventData.settings && hasOwn(eventData.settings, 'bind_preset_to_connection')) {
            eventData.settings.bind_preset_to_connection = false;
            state.nativePresetBindKnown = false;
        }

        const preset = eventData.preset;
        const settingsToUpdate = eventData.settingsToUpdate;
        if (preset && settingsToUpdate && typeof settingsToUpdate === 'object') {
            for (const [presetKey, descriptor] of Object.entries(settingsToUpdate)) {
                const settingName = Array.isArray(descriptor) ? descriptor[1] : '';
                const isConnection = Array.isArray(descriptor) && Boolean(descriptor[3]);
                if (!isConnection) {
                    continue;
                }
                delete preset[presetKey];
                if (settingName && settingName !== presetKey) {
                    delete preset[settingName];
                }
            }
        }

        applyOfficialPresetConnectionDecouple();
        enforcePresetConnectionDecouple().catch(error => {
            console.warn('[Chat Search Jump] Failed to enforce preset/API decouple before preset change.', error);
        });
    }

    function handlePresetChangedForApiGuard() {
        state.presetGuardActiveUntil = Date.now() + 4000;
        enforcePresetConnectionDecouple().catch(error => {
            console.warn('[Chat Search Jump] Failed to enforce preset/API decouple after preset change.', error);
        });
        if (state.apiSwitching) {
            return;
        }
        scheduleLockedProfileRestore('preset changed');
    }

    function handleMainApiChangedForApiGuard() {
        if (state.apiSwitching) {
            return;
        }

        if (Date.now() < state.presetGuardActiveUntil) {
            scheduleLockedProfileRestore('API changed during preset change');
            return;
        }

        scheduleLockedProfileSync('manual API changed');
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

    function escapeHtmlWithBreaks(value) {
        return escapeHtml(value).split(String.fromCharCode(10)).join('<br>');
    }

    function normalizeSnapshotNewlines(text) {
        const newline = String.fromCharCode(10);
        const carriage = String.fromCharCode(13);
        return String(text ?? '')
            .split(carriage + newline).join(newline)
            .split(carriage).join(newline);
    }

    function trimSnapshotText(text) {
        const plain = normalizeSnapshotNewlines(stripHtml(text)).trim();
        if (!plain) {
            return { text: '', truncated: false };
        }
        if (plain.length <= SNAPSHOT_TEXT_LIMIT) {
            return { text: plain, truncated: false };
        }
        return { text: `${plain.slice(0, SNAPSHOT_TEXT_LIMIT).trimEnd()}...`, truncated: true };
    }

    function highlightSnapshotText(text, query = state.query, caseSensitive = getSettings().caseSensitive) {
        const snapshot = trimSnapshotText(text);
        if (!snapshot.text) {
            return '<em>空消息</em>';
        }

        const needleSource = String(query ?? '').trim();
        if (!needleSource) {
            return escapeHtmlWithBreaks(snapshot.text);
        }

        const haystack = caseSensitive ? snapshot.text : snapshot.text.toLocaleLowerCase();
        const needle = caseSensitive ? needleSource : needleSource.toLocaleLowerCase();
        const pieces = [];
        let cursor = 0;
        let index = haystack.indexOf(needle);

        while (index >= 0) {
            pieces.push(escapeHtmlWithBreaks(snapshot.text.slice(cursor, index)));
            pieces.push('<mark>');
            pieces.push(escapeHtmlWithBreaks(snapshot.text.slice(index, index + needleSource.length)));
            pieces.push('</mark>');
            cursor = index + needleSource.length;
            index = haystack.indexOf(needle, cursor);
        }

        pieces.push(escapeHtmlWithBreaks(snapshot.text.slice(cursor)));
        if (snapshot.truncated) {
            pieces.push('<div class="stcsj-snapshot-truncated">内容较长，快照中已截断。点“跳这层”可回到完整原文。</div>');
        }
        return pieces.join('');
    }

    function messageIdEquals(left, right) {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) {
            return leftNumber === rightNumber;
        }
        return String(left) === String(right);
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

        state.messages = messages;
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
            const hidden = result.hidden ? '<span class="stcsj-badge">隐藏</span>' : '';
            return `
                <div class="stcsj-result-row">
                    <button type="button" class="stcsj-result${active}" data-stcsj-action="jump-result" data-index="${index}" title="跳转到第 ${escapeHtml(result.id)} 楼">
                        <span class="stcsj-result-meta">
                            <span>#${escapeHtml(result.id)}</span>
                            <span>${escapeHtml(result.name)}</span>
                            <span>命中 ${escapeHtml(result.matchCount)}</span>
                            ${hidden}
                        </span>
                        <span class="stcsj-result-snippet">${result.snippet}</span>
                    </button>
                    <button type="button" class="stcsj-icon-btn stcsj-result-snapshot" data-stcsj-action="snapshot-result" data-index="${index}" title="查看前后快照" aria-label="查看前后快照">
                        <i class="fa-solid fa-eye"></i><span>前后</span>
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
            const hidden = favorite.hidden ? '<span class="stcsj-badge">隐藏</span>' : '';
            const date = favorite.createdAt ? new Date(favorite.createdAt).toLocaleString() : '';
            return `
                <div class="stcsj-result-row">
                    <button type="button" class="stcsj-result stcsj-favorite-item" data-stcsj-action="jump-favorite" data-id="${escapeHtml(favorite.id)}" title="跳转到第 ${escapeHtml(favorite.id)} 楼">
                        <span class="stcsj-result-meta">
                            <span>#${escapeHtml(favorite.id)}</span>
                            <span>${escapeHtml(favorite.name || roleLabel(favorite.role))}</span>
                            ${date ? `<span>${escapeHtml(date)}</span>` : ''}
                            ${hidden}
                        </span>
                        <span class="stcsj-result-snippet">${escapeHtml(favorite.preview || `第 ${favorite.id} 楼`)}</span>
                    </button>
                    <button type="button" class="stcsj-icon-btn stcsj-result-snapshot" data-stcsj-action="snapshot-favorite" data-id="${escapeHtml(favorite.id)}" title="查看前后快照" aria-label="查看前后快照">
                        <i class="fa-solid fa-eye"></i><span>前后</span>
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

    function getCachedMessages() {
        const chat = getContext()?.chat;
        if (Array.isArray(chat)) {
            return chat.map(mapContextMessage).filter(message => Number.isInteger(message.id));
        }
        return Array.isArray(state.messages) ? state.messages : [];
    }

    function findMessageIndexById(messages, messageId) {
        return messages.findIndex(message => messageIdEquals(message.id, messageId));
    }

    function findCachedMessageById(messageId) {
        return getCachedMessages().find(message => messageIdEquals(message.id, messageId)) || null;
    }

    function renderSnapshotMessages(messages, targetIndex) {
        const start = Math.max(0, targetIndex - SNAPSHOT_RADIUS);
        const end = Math.min(messages.length - 1, targetIndex + SNAPSHOT_RADIUS);
        const targetId = messages[targetIndex]?.id;
        const query = state.query || findFavorite(targetId)?.query || '';

        return messages.slice(start, end + 1).map(message => {
            const isTarget = messageIdEquals(message.id, targetId);
            const hidden = message.hidden ? '<span class="stcsj-badge">隐藏</span>' : '';
            return `
                <article class="stcsj-snapshot-message${isTarget ? ' target' : ''}">
                    <div class="stcsj-snapshot-meta">
                        <span>#${escapeHtml(message.id)}</span>
                        <strong>${escapeHtml(message.name || roleLabel(message.role))}</strong>
                        ${hidden}
                        ${isTarget ? '<span class="stcsj-badge stcsj-badge-target">命中楼层</span>' : ''}
                        <button type="button" class="stcsj-text-btn stcsj-snapshot-jump-one" data-stcsj-action="jump-snapshot-message" data-id="${escapeHtml(message.id)}">跳这层</button>
                    </div>
                    <div class="stcsj-snapshot-text">${highlightSnapshotText(message.text, query)}</div>
                </article>`;
        }).join('');
    }

    async function openSnapshotForMessage(messageId) {
        const token = ++state.snapshotToken;
        state.snapshotTargetId = messageId;
        if (!elements.snapshot || !elements.snapshotList) {
            return;
        }

        elements.snapshot.hidden = false;
        elements.snapshot.classList.add('open');
        elements.snapshotTitle.textContent = `第 ${messageId} 楼前后快照`;
        elements.snapshotSub.textContent = '正在读取当前聊天上下文...';
        elements.snapshotJump.dataset.id = String(messageId);
        elements.snapshotList.innerHTML = '<div class="stcsj-empty">加载中...</div>';

        try {
            let messages = getCachedMessages();
            if (!messages.length || findMessageIndexById(messages, messageId) < 0) {
                messages = await readMessages();
                state.messages = messages;
            }
            if (token !== state.snapshotToken) {
                return;
            }

            const targetIndex = findMessageIndexById(messages, messageId);
            if (targetIndex < 0) {
                elements.snapshotSub.textContent = '没有在当前聊天数据里找到这层。';
                elements.snapshotList.innerHTML = '<div class="stcsj-empty">找不到这条消息。可以先点搜索结果跳转，等旧楼层加载出来后再打开快照。</div>';
                return;
            }

            const target = messages[targetIndex];
            const start = Math.max(0, targetIndex - SNAPSHOT_RADIUS);
            const end = Math.min(messages.length - 1, targetIndex + SNAPSHOT_RADIUS);
            elements.snapshotTitle.textContent = `第 ${target.id} 楼前后快照`;
            elements.snapshotSub.textContent = `显示 #${messages[start].id} - #${messages[end].id}，共 ${end - start + 1} 条。`;
            elements.snapshotJump.dataset.id = String(target.id);
            elements.snapshotList.innerHTML = renderSnapshotMessages(messages, targetIndex);
            requestAnimationFrame(() => {
                elements.snapshotList.querySelector('.stcsj-snapshot-message.target')?.scrollIntoView({ block: 'center' });
            });
        } catch (error) {
            console.error('[Chat Search Jump] Failed to render snapshot.', error);
            elements.snapshotSub.textContent = '读取失败';
            elements.snapshotList.innerHTML = '<div class="stcsj-empty">打开前后快照失败。请刷新页面后再试。</div>';
        }
    }

    function closeSnapshot() {
        if (!elements.snapshot) {
            return;
        }
        elements.snapshot.classList.remove('open');
        elements.snapshot.hidden = true;
        state.snapshotTargetId = null;
    }

    function isSnapshotOpen() {
        return Boolean(elements.snapshot && !elements.snapshot.hidden && elements.snapshot.classList.contains('open'));
    }

    function renderToolPanelLoading() {
        elements.toolPanel.innerHTML = `
            <div class="stcsj-tool-title"><span><i class="fa-solid fa-wand-magic-sparkles"></i> 酒馆工具</span></div>
            <button type="button" class="stcsj-tool-action" id="${ID}-open-search"><i class="fa-solid fa-magnifying-glass"></i><span>聊天搜索</span><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="stcsj-tool-action" id="${ID}-open-favorites"><i class="fa-solid fa-star"></i><span>收藏消息</span><strong class="stcsj-tool-count stcsj-favorite-count">${getFavorites().length}</strong></button>
            <div class="stcsj-tool-section-title">API 配置</div>
            <div class="stcsj-tool-note">扩展默认只切 API / URL / 模型 / 密钥，不再跟着切 Settings Preset。</div>
            <div class="stcsj-tool-empty">读取配置中...</div>`;

        positionToolPanel();

        elements.toolPanel.querySelector(`#${ID}-open-search`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('search');
        });
        elements.toolPanel.querySelector(`#${ID}-open-favorites`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('favorites');
        });
    }

    async function renderToolPanel() {
        renderToolPanelLoading();
        const [profiles, current] = await Promise.all([getProfiles(), getCurrentProfile()]);
        if (!state.toolsOpen) {
            return;
        }

        state.currentProfile = current;
        updateToolBallTitle();

        const settings = getSettings();
        applyOfficialPresetConnectionDecouple();
        await seedLockedProfileIfNeeded();
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
            <div class="stcsj-tool-section-title">API 配置</div>
            <div class="stcsj-current-profile"><span>当前</span><strong>${escapeHtml(current || '未知')}</strong></div>
            <div class="stcsj-profile-list">${profileHtml}</div>
            <button type="button" class="stcsj-tool-refresh" id="${ID}-refresh-profiles"><i class="fa-solid fa-rotate-right"></i><span>刷新</span></button>`;

        positionToolPanel();

        elements.toolPanel.querySelector(`#${ID}-open-search`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('search');
        });
        elements.toolPanel.querySelector(`#${ID}-open-favorites`)?.addEventListener('click', () => {
            closeToolPanel();
            openPanel('favorites');
        });
        elements.toolPanel.querySelector(`#${ID}-refresh-profiles`)?.addEventListener('click', renderToolPanel);
        elements.toolPanel.querySelectorAll('.stcsj-profile-item').forEach(item => {
            item.addEventListener('click', async () => {
                const name = item.getAttribute('data-profile');
                if (!name) {
                    closeToolPanel();
                    return;
                }

                item.classList.add('loading');
                suppressProfileRestore(5000);
                const appliedName = await applyConnectionProfileByName(name);
                state.currentProfile = await getCurrentProfile() || appliedName || name;
                const profile = await getConnectionProfileDetails(name);
                updateToolBallTitle();
                globalThis.toastr?.success?.(`已切换连接：${name}${profile ? `（${describeConnectionProfile(profile)}）` : ''}`, 'SillyTavern Tool Ball');
                const latestSettings = getSettings();
                if (latestSettings.lockApiProfile && state.currentProfile) {
                    latestSettings.lockedProfile = state.currentProfile;
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
        const candidates = [
            document.getElementById('show_more_messages'),
            document.querySelector('#show_more_messages button, #show_more_messages [role="button"], #show_more_messages .menu_button, #show_more_messages .right_menu_button'),
            document.querySelector('.show_more_messages, [data-testid="show_more_messages"], [data-action="show_more_messages"]'),
        ].filter(Boolean);

        for (const host of candidates) {
            const nested = host.matches('button, [role="button"], .menu_button, .right_menu_button')
                ? host
                : host.querySelector('button, [role="button"], .menu_button, .right_menu_button, i, svg');

            if (isProbablyClickable(nested)) {
                return nested;
            }
            if (isProbablyClickable(host)) {
                return host;
            }
        }
        return null;
    }

    function emitPointerClick(element) {
        if (!element) {
            return false;
        }

        const eventOptions = { bubbles: true, cancelable: true, view: window };
        try {
            element.dispatchEvent(new MouseEvent('pointerdown', eventOptions));
            element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            element.dispatchEvent(new MouseEvent('click', eventOptions));
            return true;
        } catch (error) {
            console.warn('[Chat Search Jump] Failed to dispatch pointer click.', error);
            return false;
        }
    }

    function clickShowMore(button) {
        if (!button) {
            return false;
        }

        let clicked = false;
        try {
            if (typeof globalThis.$ === 'function') {
                globalThis.$(button).trigger('click');
                clicked = true;
            }
        } catch (error) {
            console.warn('[Chat Search Jump] jQuery click on #show_more_messages failed.', error);
        }

        try {
            button.click?.();
            clicked = true;
        } catch (error) {
            console.warn('[Chat Search Jump] Native click on #show_more_messages failed.', error);
        }

        return emitPointerClick(button) || clicked;
    }

    function scrollChatToTop() {
        const container = getChatContainer();
        try {
            if (container && container !== document.body) {
                container.scrollTop = 0;
                container.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
            window.scrollTo({ top: 0, behavior: 'auto' });
        } catch {
            try {
                window.scrollTo(0, 0);
            } catch {
                // Ignore scroll failures.
            }
        }
    }

    async function importCoreModule() {
        if (state.coreModulePromise) {
            return state.coreModulePromise;
        }

        state.coreModulePromise = (async () => {
            for (const modulePath of CORE_MODULE_PATHS) {
                try {
                    return await import(modulePath);
                } catch {
                    // Try the next path. Different ST deployments can use different base URLs.
                }
            }
            return null;
        })();

        return state.coreModulePromise;
    }

    async function callCoreShowMoreMessages() {
        const context = getContext();
        const localCandidates = [
            globalThis.showMoreMessages,
            globalThis.loadMoreMessages,
            globalThis.loadOlderMessages,
            context?.showMoreMessages,
            context?.loadMoreMessages,
            context?.loadOlderMessages,
        ];

        for (const candidate of localCandidates) {
            if (typeof candidate !== 'function') {
                continue;
            }
            try {
                await candidate.call(context || globalThis);
                return true;
            } catch (error) {
                console.warn('[Chat Search Jump] Core show-more function failed.', error);
            }
        }

        const module = await importCoreModule();
        const moduleCandidates = [module?.showMoreMessages, module?.loadMoreMessages, module?.loadOlderMessages];
        for (const candidate of moduleCandidates) {
            if (typeof candidate !== 'function') {
                continue;
            }
            try {
                await candidate();
                return true;
            } catch (error) {
                console.warn('[Chat Search Jump] Imported show-more function failed.', error);
            }
        }

        return false;
    }

    async function triggerLoadOlderMessages() {
        scrollChatToTop();
        await wait(30);

        const button = getShowMoreButton();
        if (button && clickShowMore(button)) {
            return true;
        }

        return callCoreShowMoreMessages();
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
        let noLoaderWaits = 0;

        for (let attempt = 0; attempt < MAX_AUTO_LOAD_ATTEMPTS; attempt += 1) {
            const firstRenderedId = getFirstRenderedMessageId();
            const targetIsOlder = firstRenderedId === null || Number(messageId) < firstRenderedId;

            if (!targetIsOlder) {
                element = await waitForMessageElement(messageId, 450);
                if (element) {
                    return element;
                }

                // The requested id falls inside the already-rendered range but no .mes exists.
                // That usually means it is a hidden/system/deleted message, so loading older messages will not help.
                break;
            }

            onProgress?.(attempt + 1, firstRenderedId);
            const loaded = await triggerLoadOlderMessages();
            if (!loaded) {
                if (noLoaderWaits < 6) {
                    noLoaderWaits += 1;
                    await wait(500);
                    element = findMessageElement(messageId);
                    if (element) {
                        return element;
                    }
                    continue;
                }
                break;
            }

            noLoaderWaits = 0;
            element = await waitForMessageElement(messageId, 1200);
            if (element) {
                return element;
            }

            await wait(150);
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
            const cachedMessage = findCachedMessageById(numericId);
            if (cachedMessage) {
                await openSnapshotForMessage(numericId);
                const reason = cachedMessage.hidden
                    ? '这条是隐藏/系统消息，SillyTavern 不会把它渲染成可滚动楼层。'
                    : '这条消息在聊天数据里，但当前页面没有渲染它。';
                globalThis.toastr?.info?.(`第 ${numericId} 楼暂时不能跳转，已打开前后快照。${reason}`, 'Chat Search Jump');
            } else {
                globalThis.toastr?.warning?.(`找不到第 ${numericId} 楼。可能消息被删除，或旧楼层加载按钮不可用。`, 'Chat Search Jump');
            }
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

    async function jumpToResult(index, occurrenceIndex = 0) {
        const result = state.results[index];
        if (!result) {
            return;
        }

        if (result.hidden) {
            state.activeIndex = index;
            state.activeOccurrence = occurrenceIndex;
            state.mode = 'search';
            renderPanelList();
            await openSnapshotForMessage(result.id);
            globalThis.toastr?.info?.(`第 ${result.id} 楼是隐藏/系统消息，不能滚动定位，已打开前后快照。`, 'Chat Search Jump');
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
            await openSnapshotForMessage(result.id);
            globalThis.toastr?.info?.(`第 ${result.id} 楼没有渲染，已打开前后快照。`, 'Chat Search Jump');
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
        closeSnapshot();
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
        if (!elements.toggle) {
            return;
        }
        const parts = ['酒馆工具'];
        if (state.currentProfile) {
            parts.push(`当前 API：${state.currentProfile}`);
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
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
        const panelWidth = elements.toolPanel?.offsetWidth || Math.min(306, viewportWidth - 16);
        const maxPanelHeight = Math.min(570, Math.max(180, viewportHeight - 16));
        const panelHeight = Math.min(elements.toolPanel?.scrollHeight || maxPanelHeight, maxPanelHeight);
        const ballWidth = elements.toggle.offsetWidth || 50;
        let left = settings.ballX + ballWidth + 10;
        let top = settings.ballY - 10;

        if (left + panelWidth > viewportWidth - 8) {
            left = settings.ballX - panelWidth - 10;
        }
        left = Math.max(8, Math.min(left, viewportWidth - panelWidth - 8));

        if (top + panelHeight > viewportHeight - 8) {
            top = viewportHeight - panelHeight - 8;
        }
        top = Math.max(8, top);

        elements.toolPanel.style.left = `${left}px`;
        elements.toolPanel.style.top = `${top}px`;
        elements.toolPanel.style.maxHeight = `${Math.max(180, Math.min(570, viewportHeight - top - 8))}px`;
    }

    function stopToolPanelScrollBubble(event) {
        if (elements.toolPanel?.contains(event.target)) {
            event.stopPropagation();
        }
    }

    function attachToolPanelScrollGuard() {
        elements.toolPanel?.addEventListener('wheel', stopToolPanelScrollBubble, { passive: true });
        elements.toolPanel?.addEventListener('touchmove', stopToolPanelScrollBubble, { passive: true });
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
                    <button type="button" class="stcsj-text-btn stcsj-api-open" id="${ID}-open-api-from-search" title="打开预设/API 解耦设置"><i class="fa-solid fa-link-slash"></i><span>API</span></button>
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
            </section>
            <div id="${ID}-snapshot" class="stcsj-snapshot-overlay" hidden>
                <div class="stcsj-snapshot-card" role="dialog" aria-modal="true" aria-labelledby="${ID}-snapshot-title">
                    <div class="stcsj-snapshot-card-header">
                        <div>
                            <strong id="${ID}-snapshot-title">前后快照</strong>
                            <small id="${ID}-snapshot-sub">查看命中楼层附近消息</small>
                        </div>
                        <div class="stcsj-snapshot-card-actions">
                            <button type="button" class="stcsj-text-btn" id="${ID}-snapshot-jump">跳到命中楼层</button>
                            <button type="button" class="stcsj-icon-btn" id="${ID}-snapshot-close" title="关闭快照" aria-label="关闭快照"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                    <div class="stcsj-snapshot-list" id="${ID}-snapshot-list"></div>
                </div>
            </div>`);

        elements.toggle = document.getElementById(`${ID}-toggle`);
        elements.toolPanel = document.getElementById(`${ID}-tool-panel`);
        elements.panel = document.getElementById(`${ID}-panel`);
        elements.input = document.getElementById(`${ID}-input`);
        elements.close = document.getElementById(`${ID}-close`);
        elements.openApiFromSearch = document.getElementById(`${ID}-open-api-from-search`);
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
        elements.snapshot = document.getElementById(`${ID}-snapshot`);
        elements.snapshotTitle = document.getElementById(`${ID}-snapshot-title`);
        elements.snapshotSub = document.getElementById(`${ID}-snapshot-sub`);
        elements.snapshotJump = document.getElementById(`${ID}-snapshot-jump`);
        elements.snapshotClose = document.getElementById(`${ID}-snapshot-close`);
        elements.snapshotList = document.getElementById(`${ID}-snapshot-list`);

        clampToolBall();
        attachToolBallDrag();
        attachToolPanelScrollGuard();
        syncSettingsToUi();
        updateFavoriteCount();

        elements.close.addEventListener('click', closePanel);
        elements.openApiFromSearch?.addEventListener('click', () => {
            closePanel();
            openToolPanel();
        });
        elements.input.addEventListener('input', () => {
            closeSnapshot();
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

        elements.snapshotClose.addEventListener('click', closeSnapshot);
        elements.snapshot.addEventListener('click', event => {
            if (event.target === elements.snapshot) {
                closeSnapshot();
            }
        });
        elements.snapshotJump.addEventListener('click', () => {
            const id = elements.snapshotJump.dataset.id || state.snapshotTargetId;
            closeSnapshot();
            jumpToMessageId(id, { highlight: false });
        });
        elements.snapshotList.addEventListener('click', event => {
            const actionElement = event.target.closest('[data-stcsj-action="jump-snapshot-message"]');
            if (!actionElement || !elements.snapshotList.contains(actionElement)) {
                return;
            }
            event.preventDefault();
            const id = actionElement.dataset.id;
            closeSnapshot();
            jumpToMessageId(id, { highlight: false });
        });

        [elements.searchTab, elements.favoriteTab].forEach(tab => {
            tab.addEventListener('click', () => {
                closeSnapshot();
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
            if (action === 'snapshot-result') {
                const result = state.results[Number(actionElement.dataset.index)];
                if (result) {
                    openSnapshotForMessage(result.id);
                }
                return;
            }
            if (action === 'snapshot-favorite') {
                openSnapshotForMessage(actionElement.dataset.id);
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
            if (event.key === 'Escape' && isSnapshotOpen()) {
                closeSnapshot();
                return;
            }
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
        state.messages = [];
        state.activeIndex = -1;
        state.activeOccurrence = 0;
        state.mode = 'search';
        clearOccurrenceHighlight();
        closeSnapshot();
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

        on('CHAT_CHANGED', clearOnChatChange);
        on('MESSAGE_EDITED', scheduleSearch);
        on('MESSAGE_DELETED', scheduleSearch);
        on('MESSAGE_SWIPED', scheduleSearch);
        on('MESSAGE_UPDATED', scheduleSearch);
        on('USER_MESSAGE_RENDERED', scheduleSearch);
        on('CHARACTER_MESSAGE_RENDERED', scheduleSearch);

        on('OAI_PRESET_CHANGED_BEFORE', stripConnectionFieldsFromPresetEvent);
        on('OAI_PRESET_CHANGED_AFTER', handlePresetChangedForApiGuard);
        on('PRESET_CHANGED', handlePresetChangedForApiGuard);
        on('SETTINGS_UPDATED', () => enforcePresetConnectionDecouple({ notify: false }));
        on('MAIN_API_CHANGED', handleMainApiChangedForApiGuard);
        on('GENERATION_STARTED', () => restoreLockedProfileIfNeeded('generation started'));
    }

    function init() {
        if (state.initialized) {
            return;
        }

        state.initialized = true;
        createUi();
        subscribeToEvents();

        getCurrentProfile().then(async profile => {
            state.currentProfile = profile;
            await enforcePresetConnectionDecouple({ notify: false });
            await seedLockedProfileIfNeeded();
            updateToolBallTitle();
        }).catch(error => {
            console.warn('[Chat Search Jump] Failed to initialize API guard.', error);
        });

        window.setInterval(() => {
            enforcePresetConnectionDecouple({ notify: false }).catch(error => {
                console.warn('[Chat Search Jump] Periodic preset/API decouple failed.', error);
            });
        }, API_GUARD_ENFORCE_MS);

        window.setInterval(async () => {
            await restoreLockedProfileIfNeeded('periodic check');
            state.currentProfile = await getCurrentProfile();
            updateToolBallTitle();
        }, PROFILE_LOCK_POLL_MS);

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
