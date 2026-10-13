(() => {
    'use strict';

    const MODULE_NAME = 'chat_search_jump';
    const API_MANAGER_KEY = 'api-config-manager';
    const FAVORITE_KEY = 'chat_search_jump_favorites_v3';
    const ID = 'st-tool-ball';
    const MAIN_API_CHAT_COMPLETION = 'openai';
    const CHAT_SOURCE_CUSTOM = 'custom';
    const CHAT_SOURCE_CLAUDE = 'claude';
    const CHAT_SOURCE_MAKERSUITE = 'makersuite';

    const DEFAULT_SETTINGS = Object.freeze({
        ballX: null,
        ballY: null,
        activeTab: 'api',
        apiFilter: '',
        activeApiKey: '',
        activeApiName: '',
    });

    const SOURCE_ALIASES = Object.freeze({
        anthropic: CHAT_SOURCE_CLAUDE,
        'anthropic-claude': CHAT_SOURCE_CLAUDE,
        google: CHAT_SOURCE_MAKERSUITE,
        ai_studio: CHAT_SOURCE_MAKERSUITE,
        aistudio: CHAT_SOURCE_MAKERSUITE,
        'google-ai-studio': CHAT_SOURCE_MAKERSUITE,
        google_ai_studio: CHAT_SOURCE_MAKERSUITE,
        gemini: CHAT_SOURCE_MAKERSUITE,
        'azure-openai': 'azure_openai',
        azure: 'azure_openai',
        'ai-ml-api': 'aimlapi',
        aiml: 'aimlapi',
        'x-ai': 'xai',
        'mistral-ai': 'mistralai',
        mistral: 'mistralai',
        'electron-hub': 'electronhub',
        'nano-gpt': 'nanogpt',
        nanogptai: 'nanogpt',
        'workers-ai': 'workers_ai',
        cloudflare: 'workers_ai',
        'cloudflare-workers-ai': 'workers_ai',
        glm: 'zai',
        z_ai: 'zai',
        'z-ai': 'zai',
        'silicon-flow': 'siliconflow',
        'mini-max': 'minimax',
    });

    const SOURCE_LABELS = Object.freeze({
        [CHAT_SOURCE_CUSTOM]: 'Custom (OpenAI兼容)',
        [CHAT_SOURCE_CLAUDE]: 'Claude / Anthropic',
        [CHAT_SOURCE_MAKERSUITE]: 'Google AI Studio',
        openai: 'OpenAI',
        openrouter: 'OpenRouter',
        ai21: 'AI21',
        vertexai: 'Vertex AI',
        mistralai: 'Mistral AI',
        cohere: 'Cohere',
        perplexity: 'Perplexity',
        groq: 'Groq',
        electronhub: 'ElectronHub',
        chutes: 'Chutes',
        nanogpt: 'NanoGPT',
        deepseek: 'DeepSeek',
        aimlapi: 'AI/ML API',
        xai: 'xAI',
        pollinations: 'Pollinations',
        moonshot: 'Moonshot',
        fireworks: 'Fireworks',
        cometapi: 'CometAPI',
        azure_openai: 'Azure OpenAI',
        zai: 'Z.ai',
        siliconflow: 'SiliconFlow',
        workers_ai: 'Cloudflare Workers AI',
        minimax: 'Minimax',
    });

    const SOURCE_SECRET_KEYS = Object.freeze({
        [CHAT_SOURCE_CUSTOM]: 'api_key_custom',
        [CHAT_SOURCE_CLAUDE]: 'api_key_claude',
        [CHAT_SOURCE_MAKERSUITE]: 'api_key_makersuite',
        openai: 'api_key_openai',
        openrouter: 'api_key_openrouter',
        ai21: 'api_key_ai21',
        vertexai: 'api_key_vertexai',
        mistralai: 'api_key_mistralai',
        cohere: 'api_key_cohere',
        perplexity: 'api_key_perplexity',
        groq: 'api_key_groq',
        chutes: 'api_key_chutes',
        electronhub: 'api_key_electronhub',
        nanogpt: 'api_key_nanogpt',
        deepseek: 'api_key_deepseek',
        aimlapi: 'api_key_aimlapi',
        xai: 'api_key_xai',
        pollinations: 'api_key_pollinations',
        moonshot: 'api_key_moonshot',
        fireworks: 'api_key_fireworks',
        cometapi: 'api_key_cometapi',
        azure_openai: 'api_key_azure_openai',
        zai: 'api_key_zai',
        siliconflow: 'api_key_siliconflow',
        workers_ai: 'api_key_workers_ai',
        minimax: 'api_key_minimax',
    });

    const SOURCE_MODEL_SETTINGS = Object.freeze({
        [CHAT_SOURCE_CUSTOM]: 'custom_model',
        [CHAT_SOURCE_CLAUDE]: 'claude_model',
        [CHAT_SOURCE_MAKERSUITE]: 'google_model',
        openai: 'openai_model',
        openrouter: 'openrouter_model',
        ai21: 'ai21_model',
        vertexai: 'vertexai_model',
        mistralai: 'mistralai_model',
        cohere: 'cohere_model',
        perplexity: 'perplexity_model',
        groq: 'groq_model',
        electronhub: 'electronhub_model',
        chutes: 'chutes_model',
        nanogpt: 'nanogpt_model',
        deepseek: 'deepseek_model',
        aimlapi: 'aimlapi_model',
        xai: 'xai_model',
        pollinations: 'pollinations_model',
        moonshot: 'moonshot_model',
        fireworks: 'fireworks_model',
        cometapi: 'cometapi_model',
        azure_openai: 'azure_openai_model',
        zai: 'zai_model',
        siliconflow: 'siliconflow_model',
        workers_ai: 'workers_ai_model',
        minimax: 'minimax_model',
    });

    const SOURCE_MODEL_SELECTORS = Object.freeze({
        [CHAT_SOURCE_CUSTOM]: '#custom_model_id',
        [CHAT_SOURCE_CLAUDE]: '#model_claude_select',
        [CHAT_SOURCE_MAKERSUITE]: '#model_google_select',
        openai: '#model_openai_select',
        openrouter: '#model_openrouter_select',
        ai21: '#model_ai21_select',
        vertexai: '#model_vertexai_select',
        mistralai: '#model_mistralai_select',
        cohere: '#model_cohere_select',
        perplexity: '#model_perplexity_select',
        groq: '#model_groq_select',
        electronhub: '#model_electronhub_select',
        chutes: '#model_chutes_select',
        nanogpt: '#model_nanogpt_select',
        deepseek: '#model_deepseek_select',
        aimlapi: '#model_aimlapi_select',
        xai: '#model_xai_select',
        pollinations: '#model_pollinations_select',
        moonshot: '#model_moonshot_select',
        fireworks: '#model_fireworks_select',
        cometapi: '#model_cometapi_select',
        azure_openai: '#azure_openai_model',
        zai: '#model_zai_select',
        siliconflow: '#model_siliconflow_select',
        workers_ai: '#model_workers_ai_select',
        minimax: '#model_minimax_select',
    });

    const SOURCE_ENDPOINT_FIELDS = Object.freeze({
        [CHAT_SOURCE_CUSTOM]: { setting: 'custom_url', selector: '#custom_api_url_text', configKey: 'customUrl' },
        siliconflow: { setting: 'siliconflow_endpoint', selector: '#siliconflow_endpoint', configKey: 'siliconflowEndpoint' },
        minimax: { setting: 'minimax_endpoint', selector: '#minimax_endpoint', configKey: 'minimaxEndpoint' },
        zai: { setting: 'zai_endpoint', selector: '#zai_endpoint', configKey: 'zaiEndpoint' },
        azure_openai: { setting: 'azure_base_url', selector: '#azure_base_url', configKey: 'azureBaseUrl' },
        workers_ai: { setting: 'workers_ai_account_id', selector: '#workers_ai_account_id', configKey: 'workersAiAccountId' },
    });

    const REVERSE_PROXY_SOURCES = new Set([
        'openai',
        CHAT_SOURCE_CLAUDE,
        CHAT_SOURCE_MAKERSUITE,
        'vertexai',
        'mistralai',
        'deepseek',
        'xai',
        'moonshot',
        'zai',
    ]);

    const CORE_MODULE_PATHS = Object.freeze(['/script.js', './script.js', '../script.js']);
    const OPENAI_MODULE_PATHS = Object.freeze(['/scripts/openai.js', './scripts/openai.js', '../scripts/openai.js']);
    const ARCHIVE_ORIGIN = location.origin;
    const ARCHIVE_URL = new URL('/api/plugins/tool-ball-archive/', ARCHIVE_ORIGIN);

    const state = {
        coreModulePromise: null,
        openAiModulePromise: null,
        apiItems: [],
        busyApiKey: '',
        dragging: false,
        jumpRequestId: 0,
        jumpQueue: Promise.resolve(),
        archiveStarted: false,
        archiveReady: false,
        archiveTimer: null,
    };

    const elements = {};
    const fallbackSettings = { ...DEFAULT_SETTINGS };
    let fallbackFavoriteStore = null;

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

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => escapeMap[character]);
    }

    function firstString(...values) {
        for (const value of values) {
            const text = String(value ?? '').trim();
            if (text) {
                return text;
            }
        }
        return '';
    }

    function normalizeSource(source) {
        const normalized = String(source || CHAT_SOURCE_CUSTOM).trim().toLowerCase();
        const aliased = SOURCE_ALIASES[normalized] || normalized;
        return SOURCE_LABELS[aliased] ? aliased : CHAT_SOURCE_CUSTOM;
    }

    function sourceLabel(source) {
        const normalized = normalizeSource(source);
        return SOURCE_LABELS[normalized] || normalized;
    }

    function hashString(value) {
        const text = String(value ?? '');
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
        }
        return Math.abs(hash).toString(36);
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
        try {
            getContext()?.saveSettingsDebounced?.();
        } catch (error) {
            console.warn('[SillyTavern Tool Ball] Failed to save settings.', error);
        }
    }

    async function importFirst(paths) {
        let lastError = null;
        for (const path of paths) {
            try {
                return await import(path);
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Module import failed.');
    }

    async function getCoreModule() {
        if (!state.coreModulePromise) {
            state.coreModulePromise = importFirst(CORE_MODULE_PATHS).catch(error => {
                state.coreModulePromise = null;
                throw error;
            });
        }
        return state.coreModulePromise;
    }

    async function getOpenAiModule() {
        if (!state.openAiModulePromise) {
            state.openAiModulePromise = importFirst(OPENAI_MODULE_PATHS).catch(error => {
                state.openAiModulePromise = null;
                throw error;
            });
        }
        return state.openAiModulePromise;
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
                return typeof result?.pipe === 'string' ? result.pipe : (typeof result === 'string' ? result : '');
            }
        } catch (error) {
            console.warn('[SillyTavern Tool Ball] Slash command failed:', command, error);
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

    function getApiManagerStore() {
        return getContext()?.extensionSettings?.[API_MANAGER_KEY] ?? null;
    }

    function shouldRepairRelayConfig(config) {
        const source = normalizeSource(config?.source);
        const hasCustomSecret = Boolean(config?.secretIds?.api_key_custom || config?.secretId);
        return hasCustomSecret && (source === CHAT_SOURCE_CLAUDE || source === 'anthropic');
    }

    function repairRelayConfigs() {
        const store = getApiManagerStore();
        const configs = Array.isArray(store?.configs) ? store.configs : [];
        let changed = false;

        for (const config of configs) {
            if (!config || typeof config !== 'object' || !shouldRepairRelayConfig(config)) {
                continue;
            }

            const endpoint = firstString(config.customUrl, config.url, config.reverseProxy);
            config.source = CHAT_SOURCE_CUSTOM;
            if (endpoint) {
                config.customUrl = endpoint;
                config.url = endpoint;
            }
            delete config.reverseProxy;
            changed = true;
        }

        if (changed) {
            saveSettings();
        }
        return changed;
    }

    function getApiConfigs() {
        repairRelayConfigs();
        const configs = getApiManagerStore()?.configs;
        return Array.isArray(configs) ? configs : [];
    }

    function getConfigSource(config) {
        return normalizeSource(config?.source || CHAT_SOURCE_CUSTOM);
    }

    function getConfigEndpoint(config, source = getConfigSource(config)) {
        const field = SOURCE_ENDPOINT_FIELDS[source];
        if (field) {
            return firstString(config?.[field.configKey], config?.[field.setting], config?.endpoint, config?.customUrl, config?.url, config?.baseUrl, config?.reverseProxy);
        }
        if (source === CHAT_SOURCE_CUSTOM) {
            return firstString(config?.customUrl, config?.url, config?.endpoint, config?.baseUrl, config?.reverseProxy);
        }
        return firstString(config?.reverseProxy, config?.customUrl, config?.url, config?.endpoint, config?.baseUrl);
    }

    function getConfigSecretId(config, source = getConfigSource(config)) {
        const secretKey = SOURCE_SECRET_KEYS[source];
        const secretIds = config?.secretIds && typeof config.secretIds === 'object' ? config.secretIds : {};
        return firstString(secretIds[secretKey], source === CHAT_SOURCE_CUSTOM ? config?.secretId : '');
    }

    function makeApiKey(config, index) {
        const explicit = firstString(config?.id, config?.uuid);
        if (explicit) {
            return `api:${explicit}`;
        }
        return `api:${index}:${hashString([
            config?.name,
            config?.source,
            getConfigEndpoint(config),
            config?.model,
            JSON.stringify(config?.secretIds || {}),
        ].join('|'))}`;
    }

    function getApiItems() {
        return getApiConfigs().map((config, index) => {
            const source = getConfigSource(config);
            const endpoint = getConfigEndpoint(config, source);
            const secretId = getConfigSecretId(config, source);
            const name = firstString(config?.name, `API 配置 ${index + 1}`);
            return {
                key: makeApiKey(config, index),
                index,
                name,
                source,
                sourceLabel: sourceLabel(source),
                endpoint,
                model: firstString(config?.model),
                secretId,
                secretKey: SOURCE_SECRET_KEYS[source] || '',
                config,
            };
        });
    }

    function getFilteredApiItems() {
        const filter = getSettings().apiFilter.trim().toLocaleLowerCase();
        const items = getApiItems();
        state.apiItems = items;
        if (!filter) {
            return items;
        }
        return items.filter(item => [item.name, item.sourceLabel, item.endpoint, item.model]
            .join('\n')
            .toLocaleLowerCase()
            .includes(filter));
    }

    function emitElementEvents(element) {
        if (typeof globalThis.$ === 'function') {
            globalThis.$(element).trigger('input').trigger('change');
            return;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setElementValue(selector, value, { addMissingOption = false, emit = true } = {}) {
        const element = document.querySelector(selector);
        if (!element) {
            return false;
        }

        const text = String(value ?? '');
        if (addMissingOption && element instanceof HTMLSelectElement && text && !Array.from(element.options).some(option => option.value === text)) {
            element.add(new Option(text, text));
        }

        element.value = text;
        if (emit) {
            emitElementEvents(element);
        }
        return true;
    }

    async function ensureMainApiChatCompletion() {
        const mainApiSelect = document.querySelector('#main_api');
        if (mainApiSelect) {
            if (mainApiSelect.value !== MAIN_API_CHAT_COMPLETION) {
                setElementValue('#main_api', MAIN_API_CHAT_COMPLETION, { addMissingOption: true });
            }
            return;
        }

        const coreModule = await getCoreModule();
        if (coreModule?.main_api !== MAIN_API_CHAT_COMPLETION && typeof coreModule?.changeMainAPI === 'function') {
            coreModule.changeMainAPI(MAIN_API_CHAT_COMPLETION);
        }
    }

    function setSource(source, oaiSettings, { emit = true } = {}) {
        setElementValue('#chat_completion_source', source, { addMissingOption: true, emit });
        if (oaiSettings) {
            oaiSettings.chat_completion_source = source;
        }
    }

    function setReverseProxy(endpoint, proxyPassword, oaiSettings) {
        setElementValue('#openai_reverse_proxy', endpoint, { emit: false });
        setElementValue('#openai_proxy_password', proxyPassword || '', { emit: false });
        if (oaiSettings) {
            oaiSettings.reverse_proxy = endpoint || '';
            oaiSettings.proxy_password = proxyPassword || '';
        }
    }

    function clearReverseProxy(oaiSettings) {
        setReverseProxy('', '', oaiSettings);
        setElementValue('#openai_reverse_proxy_name', 'None', { emit: false });
    }

    function setEndpoint(item, oaiSettings) {
        const endpoint = item.endpoint;
        const source = item.source;

        if (source === CHAT_SOURCE_CUSTOM) {
            clearReverseProxy(oaiSettings);
            if (endpoint) {
                setElementValue('#custom_api_url_text', endpoint, { emit: false });
                if (oaiSettings) {
                    oaiSettings.custom_url = endpoint;
                }
            }
            return;
        }

        const field = SOURCE_ENDPOINT_FIELDS[source];
        if (field && source !== CHAT_SOURCE_CUSTOM && !item.config?.reverseProxy) {
            clearReverseProxy(oaiSettings);
            if (endpoint) {
                setElementValue(field.selector, endpoint, { addMissingOption: true, emit: false });
                if (oaiSettings) {
                    oaiSettings[field.setting] = endpoint;
                }
            }
            return;
        }

        if (endpoint || REVERSE_PROXY_SOURCES.has(source)) {
            setReverseProxy(endpoint, item.config?.proxyPassword || '', oaiSettings);
        }
    }

    function setModel(item, oaiSettings) {
        if (!item.model) {
            return;
        }

        const settingKey = SOURCE_MODEL_SETTINGS[item.source] || `${item.source}_model`;
        const selector = SOURCE_MODEL_SELECTORS[item.source] || `#model_${item.source}_select`;
        if (oaiSettings && settingKey) {
            oaiSettings[settingKey] = item.model;
        }

        setElementValue(selector, item.model, { addMissingOption: true, emit: false });
        if (item.source === CHAT_SOURCE_CUSTOM) {
            setElementValue('#model_custom_select', item.model, { addMissingOption: true, emit: false });
        }
    }

    async function activateSecret(item) {
        if (item.secretId && item.secretKey) {
            await runSlashCommand(`/secret-id key=${quoteSlashArg(item.secretKey)} quiet=true ${quoteSlashArg(item.secretId)}`);
            return;
        }

        if (item.config?.key && item.secretKey) {
            const label = `ACM: ${item.name}`;
            const id = await runSlashCommand(`/secret key=${quoteSlashArg(item.secretKey)} label=${quoteSlashArg(label)} quiet=true ${quoteSlashArg(item.config.key)}`);
            if (id) {
                if (!item.config.secretIds || typeof item.config.secretIds !== 'object') {
                    item.config.secretIds = {};
                }
                item.config.secretIds[item.secretKey] = id.trim();
            }
        }
    }

    async function applyApiItem(item) {
        if (!item) {
            return;
        }

        state.busyApiKey = item.key;
        renderApiList();

        try {
            const openAiModule = await getOpenAiModule();
            const oaiSettings = openAiModule?.oai_settings || {};
            await ensureMainApiChatCompletion();
            setSource(item.source, oaiSettings, { emit: false });
            setEndpoint(item, oaiSettings);
            setModel(item, oaiSettings);
            await activateSecret(item);

            const settings = getSettings();
            settings.activeApiKey = item.key;
            settings.activeApiName = item.name;
            saveSettings();

            setSource(item.source, oaiSettings);
            globalThis.toastr?.success?.(`正在连接：${item.name}`, 'SillyTavern Tool Ball');
        } catch (error) {
            console.error('[SillyTavern Tool Ball] API switch failed:', error);
            globalThis.toastr?.error?.(`切换失败：${error.message}`, 'SillyTavern Tool Ball');
        } finally {
            state.busyApiKey = '';
            renderApiList();
        }
    }

    function stripHtml(value) {
        const div = document.createElement('div');
        div.innerHTML = String(value ?? '');
        return div.textContent || div.innerText || '';
    }

    function roleLabel(role) {
        return ({ user: '用户', assistant: '角色', system: '系统' })[role] || role || '消息';
    }

    function getFavoriteStore() {
        const context = getContext();
        if (context?.chatMetadata) {
            if (!context.chatMetadata[FAVORITE_KEY] || typeof context.chatMetadata[FAVORITE_KEY] !== 'object') {
                context.chatMetadata[FAVORITE_KEY] = { favorites: [] };
            }
            if (!Array.isArray(context.chatMetadata[FAVORITE_KEY].favorites)) {
                context.chatMetadata[FAVORITE_KEY].favorites = [];
            }
            return context.chatMetadata[FAVORITE_KEY];
        }

        if (!fallbackFavoriteStore) {
            try {
                fallbackFavoriteStore = JSON.parse(localStorage.getItem(`${ID}-favorites`) || '{}');
            } catch {
                fallbackFavoriteStore = {};
            }
            if (!Array.isArray(fallbackFavoriteStore.favorites)) {
                fallbackFavoriteStore.favorites = [];
            }
        }
        return fallbackFavoriteStore;
    }

    function getFavorites() {
        return getFavoriteStore().favorites;
    }

    async function saveFavorites() {
        const context = getContext();
        try {
            if (context?.chatMetadata && typeof context.saveMetadata === 'function') {
                await context.saveMetadata();
                return;
            }
            const core = await getCoreModule().catch(() => null);
            if (typeof core?.saveMetadata === 'function') {
                await core.saveMetadata();
                return;
            }
            localStorage.setItem(`${ID}-favorites`, JSON.stringify(getFavoriteStore()));
        } catch (error) {
            console.warn('[SillyTavern Tool Ball] Failed to save favorites.', error);
        }
    }

    function findFavorite(id) {
        return getFavorites().find(item => String(item.id) === String(id)) || null;
    }

    async function toggleFavorite(message) {
        if (!message) {
            return;
        }

        const store = getFavoriteStore();
        const exists = findFavorite(message.id);
        if (exists) {
            store.favorites = store.favorites.filter(item => String(item.id) !== String(message.id));
            globalThis.toastr?.info?.(`已取消收藏第 ${message.id} 楼`, 'SillyTavern Tool Ball');
        } else {
            store.favorites.unshift({
                id: message.id,
                name: message.name,
                role: message.role,
                preview: stripHtml(message.preview || message.text).slice(0, 220),
                createdAt: Date.now(),
            });
            globalThis.toastr?.success?.(`已收藏第 ${message.id} 楼`, 'SillyTavern Tool Ball');
        }
        await saveFavorites();
        renderFavorites();
        updateFavoriteCount();
    }

    function getRenderedMessageId(element) {
        for (const attribute of ['mesid', 'data-message-id', 'data-mes-id']) {
            const value = element.getAttribute(attribute);
            if (value === null || value.trim() === '') continue;
            const id = Number(value);
            if (Number.isInteger(id) && id >= 0) return id;
        }
        return null;
    }

    function getRenderedMessages() {
        const container = document.getElementById('chat');
        return Array.from(container?.children ?? [])
            .filter(element => element.matches('.mes') && getRenderedMessageId(element) !== null);
    }

    function findMessageElement(id) {
        return getRenderedMessages().find(element => getRenderedMessageId(element) === id) ?? null;
    }

    async function ensureMessageElement(id, isCurrent) {
        if (!isCurrent()) return null;
        let element = findMessageElement(id);
        if (element) return element;

        const rendered = getRenderedMessages().map(getRenderedMessageId);
        const firstRendered = rendered.length ? Math.min(...rendered) : getContext().chat.length;
        if (id < firstRendered) {
            const core = await getCoreModule();
            if (!isCurrent()) return null;
            if (typeof core?.showMoreMessages !== 'function') {
                throw new Error('当前 SillyTavern 没有可用的旧消息加载接口');
            }
            await core.showMoreMessages(Math.min(getContext().chat.length, firstRendered - id + 4));
            if (!isCurrent()) return null;
            element = findMessageElement(id);
        }
        return element;
    }

    async function jumpToMessage(id) {
        const requestId = ++state.jumpRequestId;
        const context = getContext();
        if (!Number.isInteger(id) || id < 0 || !Array.isArray(context?.chat) || id >= context.chat.length) {
            globalThis.toastr?.warning?.('这条消息已不存在，请重新搜索。', 'SillyTavern Tool Ball');
            return;
        }
        const chat = context.chat;
        const chatId = context.getCurrentChatId?.();
        const characterId = context.characterId;
        const groupId = context.groupId;
        const message = chat[id];
        const isCurrent = () => {
            const current = getContext();
            return requestId === state.jumpRequestId && current?.chat === chat
                && current.getCurrentChatId?.() === chatId
                && current.characterId === characterId && current.groupId === groupId
                && current.chat[id] === message;
        };
        // Serialize loads, but only the latest click may scroll or show feedback.
        const task = state.jumpQueue.catch(() => {}).then(async () => {
            if (!isCurrent()) return;
            try {
                const element = await ensureMessageElement(id, isCurrent);
                if (!isCurrent()) return;
                if (!element) {
                    globalThis.toastr?.warning?.(`第 ${id} 楼加载后仍无法定位，请重新搜索。`, 'SillyTavern Tool Ball');
                    return;
                }
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('sttb-flash-message');
                setTimeout(() => element.classList.remove('sttb-flash-message'), 1600);
            } catch (error) {
                if (isCurrent()) {
                    globalThis.toastr?.warning?.(`无法加载第 ${id} 楼：${error.message}`, 'SillyTavern Tool Ball');
                }
            }
        });
        state.jumpQueue = task;
        return task;
    }

    function renderApiList() {
        if (!elements.apiList) {
            return;
        }

        const settings = getSettings();
        const items = getFilteredApiItems();
        elements.apiCount.textContent = String(items.length);

        if (!items.length) {
            elements.apiList.innerHTML = '<div class="sttb-empty">没有 API 管理器配置</div>';
            return;
        }

        elements.apiList.innerHTML = items.map(item => {
            const active = item.key === settings.activeApiKey;
            const busy = item.key === state.busyApiKey;
            const endpoint = item.endpoint ? `<span>${escapeHtml(item.endpoint)}</span>` : '<span>无 endpoint</span>';
            const model = item.model ? `<span>${escapeHtml(item.model)}</span>` : '<span>未指定模型</span>';
            const secret = item.secretId ? '<span>secret 已保存</span>' : '<span>未绑定 secret</span>';
            return `
                <article class="sttb-api-item${active ? ' active' : ''}">
                    <button type="button" class="sttb-api-main" data-action="apply-api" data-key="${escapeHtml(item.key)}" ${busy ? 'disabled' : ''}>
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>${escapeHtml(item.sourceLabel)}</small>
                        <em>${endpoint}${model}${secret}</em>
                    </button>
                    <button type="button" class="sttb-icon-btn" data-action="apply-api" data-key="${escapeHtml(item.key)}" title="连接" ${busy ? 'disabled' : ''}>
                        ${busy ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<span class="sttb-pencil-icon" aria-hidden="true">✏️</span>'}
                    </button>
                </article>`;
        }).join('');
    }

    function renderFavorites() {
        if (!elements.favoriteList) {
            return;
        }

        const favorites = getFavorites();
        updateFavoriteCount();
        if (!favorites.length) {
            elements.favoriteList.innerHTML = '<div class="sttb-empty">当前聊天没有收藏</div>';
            return;
        }

        elements.favoriteList.innerHTML = favorites.map(item => `
            <article class="sttb-message-item">
                <button type="button" class="sttb-message-main" data-action="jump-message" data-id="${item.id}">
                    <strong>#${item.id} ${escapeHtml(item.name || roleLabel(item.role))}</strong>
                    <p>${escapeHtml(item.preview || '')}</p>
                </button>
                <button type="button" class="sttb-icon-btn" data-action="remove-favorite" data-id="${item.id}" title="取消收藏">
                    <i class="fa-solid fa-star"></i>
                </button>
            </article>`).join('');
    }

    function updateFavoriteCount() {
        if (elements.favoriteCount) {
            elements.favoriteCount.textContent = String(getFavorites().length);
        }
    }

    function archiveIsVisible() {
        return elements.panel.classList.contains('open') && getSettings().activeTab === 'search';
    }

    async function loadArchive() {
        clearTimeout(state.archiveTimer);
        state.archiveStarted = true;
        state.archiveReady = false;
        elements.archiveFrame.hidden = true;
        elements.archiveNotice.hidden = false;
        elements.archiveRetry.hidden = true;
        elements.archiveStatus.textContent = '正在连接电脑上的存档搜索…';
        elements.archiveHelp.textContent = '手机和电脑共用酒馆地址，首次连接时会自动启动搜索服务。';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const failed = message => {
            elements.archiveStatus.textContent = '暂时无法连接存档搜索';
            elements.archiveHelp.textContent = message;
            elements.archiveRetry.hidden = false;
        };
        try {
            const response = await fetch(new URL('api/status', ARCHIVE_URL), { cache: 'no-store', signal: controller.signal });
            const status = await response.json().catch(() => null);
            if (!response.ok || status?.app !== 'sillytavern-archive-search') {
                throw new Error(status?.error || '请在电脑上安装球球的服务端连接，并重启一次酒馆。安装方法见插件说明；手机无需另开程序。');
            }
            const url = new URL(ARCHIVE_URL);
            url.searchParams.set('embed', 'tool-ball');
            url.searchParams.set('parentOrigin', location.origin);
            url.searchParams.set('reload', String(Date.now()));
            elements.archiveFrame.src = url.href;
            state.archiveTimer = setTimeout(() => {
                if (!state.archiveReady) failed('存档界面未能加载，请刷新酒馆页面后重新连接。');
            }, 6000);
        } catch (error) {
            failed(error.name === 'AbortError' || error instanceof TypeError
                ? '无法连接酒馆，请确认电脑上的酒馆仍在运行，再重新连接。' : error.message);
        } finally {
            clearTimeout(timeout);
        }
    }

    function syncArchiveVisibility() {
        const visible = archiveIsVisible();
        if (visible && !state.archiveStarted) loadArchive();
        if (state.archiveReady) {
            elements.archiveFrame.contentWindow?.postMessage({ type: 'sttb:archive-visibility', visible }, ARCHIVE_ORIGIN);
        }
    }

    function setActiveTab(tab) {
        const settings = getSettings();
        settings.activeTab = tab;
        saveSettings();

        for (const name of ['api', 'search', 'favorites']) {
            const active = name === tab;
            elements.tabs?.querySelector(`[data-tab="${name}"]`)?.classList.toggle('active', active);
            elements.views?.querySelector(`[data-view="${name}"]`)?.classList.toggle('active', active);
        }

        if (tab === 'api') renderApiList();
        if (tab === 'favorites') renderFavorites();
        elements.panel.classList.toggle('sttb-archive-open', tab === 'search');
        syncArchiveVisibility();
        positionPanel();
    }

    function setPanelOpen(open) {
        elements.panel.classList.toggle('open', open);
        elements.toggle.setAttribute('aria-expanded', String(open));
        if (open) {
            const tab = getSettings().activeTab || 'api';
            setActiveTab(tab);
            positionPanel();
        } else {
            syncArchiveVisibility();
        }
    }

    function getBallSettings() {
        const settings = getSettings();
        if (typeof settings.ballX !== 'number') settings.ballX = Math.max(16, window.innerWidth - 76);
        if (typeof settings.ballY !== 'number') settings.ballY = Math.round(window.innerHeight * 0.62);
        return settings;
    }

    function positionBall() {
        const settings = getBallSettings();
        const width = elements.toggle.offsetWidth || 48;
        const height = elements.toggle.offsetHeight || 48;
        settings.ballX = Math.max(8, Math.min(settings.ballX, window.innerWidth - width - 8));
        settings.ballY = Math.max(8, Math.min(settings.ballY, window.innerHeight - height - 8));
        elements.toggle.style.left = `${settings.ballX}px`;
        elements.toggle.style.top = `${settings.ballY}px`;
        positionPanel();
    }

    function positionPanel() {
        if (!elements.panel || !elements.toggle) {
            return;
        }
        const settings = getBallSettings();
        const archive = getSettings().activeTab === 'search';
        const panelWidth = Math.min(archive ? 1040 : 420, window.innerWidth - 24);
        const panelHeight = Math.min(archive ? 820 : 620, window.innerHeight - 24);
        let left = settings.ballX + 58;
        let top = settings.ballY - 8;
        if (left + panelWidth > window.innerWidth - 12) {
            left = settings.ballX - panelWidth - 12;
        }
        if (top + panelHeight > window.innerHeight - 12) {
            top = window.innerHeight - panelHeight - 12;
        }
        elements.panel.style.left = `${Math.max(12, left)}px`;
        elements.panel.style.top = `${Math.max(12, top)}px`;
    }

    function attachDrag() {
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;
        let moved = false;

        elements.toggle.addEventListener('pointerdown', event => {
            state.dragging = true;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            const settings = getBallSettings();
            originX = settings.ballX;
            originY = settings.ballY;
            elements.toggle.setPointerCapture(event.pointerId);
        });

        elements.toggle.addEventListener('pointermove', event => {
            if (!state.dragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
            const settings = getBallSettings();
            settings.ballX = originX + dx;
            settings.ballY = originY + dy;
            positionBall();
        });

        const stop = event => {
            if (!state.dragging) return;
            state.dragging = false;
            try {
                elements.toggle.releasePointerCapture(event.pointerId);
            } catch {
                // Ignore.
            }
            if (moved) {
                saveSettings();
            } else {
                setPanelOpen(!elements.panel.classList.contains('open'));
            }
        };
        elements.toggle.addEventListener('pointerup', stop);
        elements.toggle.addEventListener('pointercancel', stop);
    }

    function createUi() {
        document.getElementById(`${ID}-toggle`)?.remove();
        document.getElementById(`${ID}-panel`)?.remove();

        document.body.insertAdjacentHTML('beforeend', `
            <button type="button" id="${ID}-toggle" class="sttb-ball" title="酒馆工具" aria-label="酒馆工具" aria-expanded="false">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
            </button>
            <section id="${ID}-panel" class="sttb-panel" aria-label="酒馆工具">
                <header class="sttb-header">
                    <strong>酒馆工具</strong>
                    <button type="button" class="sttb-icon-btn" id="${ID}-close" title="关闭"><i class="fa-solid fa-xmark"></i></button>
                </header>
                <nav class="sttb-tabs" id="${ID}-tabs">
                    <button type="button" data-tab="api"><span class="sttb-pencil-icon" aria-hidden="true">✏️</span><span>API</span><b id="${ID}-api-count">0</b></button>
                    <button type="button" data-tab="search"><i class="fa-solid fa-magnifying-glass"></i><span>搜索</span></button>
                    <button type="button" data-tab="favorites"><i class="fa-solid fa-star"></i><span>收藏</span><b id="${ID}-favorite-count">0</b></button>
                </nav>
                <div class="sttb-views" id="${ID}-views">
                    <section class="sttb-view" data-view="api">
                        <label class="sttb-field">
                            <i class="fa-solid fa-filter"></i>
                            <input type="search" id="${ID}-api-filter" placeholder="筛选 API 配置" autocomplete="off">
                        </label>
                        <div class="sttb-list" id="${ID}-api-list"></div>
                    </section>
                    <section class="sttb-view sttb-archive-view" data-view="search">
                        <div class="sttb-archive-notice" id="${ID}-archive-notice" role="status">
                            <strong id="${ID}-archive-status">正在连接存档搜索…</strong>
                            <p id="${ID}-archive-help">搜索所有角色的聊天记录，点选结果即可阅读上下文。</p>
                            <button type="button" id="${ID}-archive-retry" hidden>重新连接</button>
                        </div>
                        <iframe id="${ID}-archive-frame" title="全部聊天存档搜索与阅读" sandbox="allow-scripts allow-same-origin allow-forms" allow="clipboard-write" referrerpolicy="no-referrer" hidden></iframe>
                    </section>
                    <section class="sttb-view" data-view="favorites">
                        <div class="sttb-list" id="${ID}-favorite-list"></div>
                    </section>
                </div>
            </section>`);

        elements.toggle = document.getElementById(`${ID}-toggle`);
        elements.panel = document.getElementById(`${ID}-panel`);
        elements.close = document.getElementById(`${ID}-close`);
        elements.tabs = document.getElementById(`${ID}-tabs`);
        elements.views = document.getElementById(`${ID}-views`);
        elements.apiCount = document.getElementById(`${ID}-api-count`);
        elements.apiFilter = document.getElementById(`${ID}-api-filter`);
        elements.apiList = document.getElementById(`${ID}-api-list`);
        elements.favoriteCount = document.getElementById(`${ID}-favorite-count`);
        elements.archiveFrame = document.getElementById(`${ID}-archive-frame`);
        elements.archiveNotice = document.getElementById(`${ID}-archive-notice`);
        elements.archiveStatus = document.getElementById(`${ID}-archive-status`);
        elements.archiveHelp = document.getElementById(`${ID}-archive-help`);
        elements.archiveRetry = document.getElementById(`${ID}-archive-retry`);
        elements.favoriteList = document.getElementById(`${ID}-favorite-list`);

        const settings = getSettings();
        elements.apiFilter.value = settings.apiFilter;

        attachDrag();
        positionBall();
        bindEvents();
        setActiveTab(settings.activeTab || 'api');
        updateFavoriteCount();
    }

    function bindEvents() {
        elements.close.addEventListener('click', () => setPanelOpen(false));
        elements.tabs.addEventListener('click', event => {
            const button = event.target.closest('[data-tab]');
            if (button) {
                setActiveTab(button.dataset.tab);
            }
        });

        elements.apiFilter.addEventListener('input', () => {
            getSettings().apiFilter = elements.apiFilter.value;
            saveSettings();
            renderApiList();
        });

        elements.archiveRetry.addEventListener('click', () => loadArchive());
        window.addEventListener('message', event => {
            if (event.origin !== ARCHIVE_ORIGIN || event.source !== elements.archiveFrame.contentWindow
                || event.data?.type !== 'sttb:archive-ready' || event.data?.version !== 1) return;
            clearTimeout(state.archiveTimer);
            state.archiveReady = true;
            elements.archiveNotice.hidden = true;
            elements.archiveFrame.hidden = false;
            syncArchiveVisibility();
        });

        elements.panel.addEventListener('click', async event => {
            const action = event.target.closest('[data-action]');
            if (!action) {
                return;
            }
            const { action: actionName, key, id } = action.dataset;
            if (actionName === 'apply-api') {
                const item = getApiItems().find(candidate => candidate.key === key);
                await applyApiItem(item);
            } else if (actionName === 'jump-message') {
                await jumpToMessage(Number(id));
            } else if (actionName === 'remove-favorite') {
                const message = getFavorites().find(item => String(item.id) === String(id));
                await toggleFavorite(message);
            }
        });

        window.addEventListener('resize', positionBall);
    }

    function init() {
        createUi();
        repairRelayConfigs();
        renderApiList();
        renderFavorites();
    }

    function waitForSillyTavern(attempt = 0) {
        if (getContext()?.extensionSettings) {
            init();
            return;
        }
        if (attempt > 120) {
            console.warn('[SillyTavern Tool Ball] SillyTavern context was not ready.');
            return;
        }
        setTimeout(() => waitForSillyTavern(attempt + 1), 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => waitForSillyTavern());
    } else {
        waitForSillyTavern();
    }
})();
