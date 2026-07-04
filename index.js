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
        searchQuery: '',
        caseSensitive: false,
        includeNames: true,
        includeHidden: true,
        maxResults: 300,
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
    const SEARCH_DEBOUNCE_MS = 100;

    const state = {
        coreModulePromise: null,
        openAiModulePromise: null,
        apiItems: [],
        searchResults: [],
        searchTimer: null,
        activeResultIndex: -1,
        busyApiKey: '',
        dragging: false,
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

    function normalizeText(value, caseSensitive) {
        const text = stripHtml(value).replace(/\s+/g, ' ').trim();
        return caseSensitive ? text : text.toLocaleLowerCase();
    }

    function getActiveSwipeText(message) {
        if (!Array.isArray(message?.swipes) || !message.swipes.length) {
            return '';
        }
        const index = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        const swipe = message.swipes[Math.max(0, Math.min(index, message.swipes.length - 1))];
        return typeof swipe === 'string' ? swipe : firstString(swipe?.mes, swipe?.message);
    }

    function getMessageText(message) {
        return firstString(getActiveSwipeText(message), message?.mes, message?.message);
    }

    function getMessageRole(message) {
        if (message?.role) return String(message.role);
        if (message?.is_user) return 'user';
        if (message?.is_system) return 'system';
        return 'assistant';
    }

    function isHiddenMessage(message) {
        return Boolean(message?.is_hidden || message?.is_system || message?.hide_message || message?.extra?.is_hidden || message?.extra?.hide_message);
    }

    function roleLabel(role) {
        return ({ user: '用户', assistant: '角色', system: '系统' })[role] || role || '消息';
    }

    function getChatMessages() {
        const chat = getContext()?.chat;
        if (!Array.isArray(chat)) {
            return [];
        }
        return chat.map((message, index) => ({
            id: index,
            name: firstString(message?.name, roleLabel(getMessageRole(message))),
            role: getMessageRole(message),
            hidden: isHiddenMessage(message),
            text: getMessageText(message),
        }));
    }

    function makePreview(text, query, caseSensitive) {
        const plain = stripHtml(text).replace(/\s+/g, ' ').trim();
        if (!plain) {
            return '空消息';
        }

        const haystack = caseSensitive ? plain : plain.toLocaleLowerCase();
        const needle = caseSensitive ? query : query.toLocaleLowerCase();
        const index = needle ? haystack.indexOf(needle) : -1;
        const start = Math.max(0, (index >= 0 ? index : 0) - 44);
        const end = Math.min(plain.length, (index >= 0 ? index : 0) + Math.max(needle.length, 1) + 90);
        const snippet = `${start > 0 ? '...' : ''}${plain.slice(start, end)}${end < plain.length ? '...' : ''}`;

        if (!needle || index < 0) {
            return escapeHtml(snippet);
        }

        const local = (caseSensitive ? snippet : snippet.toLocaleLowerCase()).indexOf(needle);
        if (local < 0) {
            return escapeHtml(snippet);
        }
        return `${escapeHtml(snippet.slice(0, local))}<mark>${escapeHtml(snippet.slice(local, local + needle.length))}</mark>${escapeHtml(snippet.slice(local + needle.length))}`;
    }

    function runSearch() {
        const settings = getSettings();
        const query = settings.searchQuery.trim();
        if (!query) {
            state.searchResults = [];
            state.activeResultIndex = -1;
            renderSearchResults();
            return;
        }

        const needle = normalizeText(query, settings.caseSensitive);
        const results = [];
        for (const message of getChatMessages()) {
            if (!settings.includeHidden && message.hidden) {
                continue;
            }
            const source = settings.includeNames ? `${message.name}\n${message.text}` : message.text;
            if (!normalizeText(source, settings.caseSensitive).includes(needle)) {
                continue;
            }
            results.push({
                ...message,
                preview: makePreview(source, query, settings.caseSensitive),
            });
            if (results.length >= settings.maxResults) {
                break;
            }
        }

        state.searchResults = results;
        state.activeResultIndex = results.length ? 0 : -1;
        renderSearchResults();
    }

    function scheduleSearch() {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
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
        renderSearchResults();
        renderFavorites();
        updateFavoriteCount();
    }

    function findMessageElement(id) {
        const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(id)) : String(id).replace(/"/g, '\\"');
        return document.querySelector(`.mes[mesid="${escaped}"], .mes[data-message-id="${escaped}"], .mes[data-mes-id="${escaped}"]`);
    }

    async function ensureMessageElement(id) {
        let element = findMessageElement(id);
        if (element) {
            return element;
        }

        const firstRendered = Math.min(...Array.from(document.querySelectorAll('.mes[mesid]'))
            .map(node => Number(node.getAttribute('mesid')))
            .filter(Number.isInteger));
        if (Number.isFinite(firstRendered) && Number(id) < firstRendered) {
            const core = await getCoreModule().catch(() => null);
            await core?.showMoreMessages?.(Math.max(1, firstRendered - Number(id) + 4));
            element = findMessageElement(id);
        }
        return element;
    }

    async function jumpToMessage(id) {
        const element = await ensureMessageElement(id);
        if (!element) {
            globalThis.toastr?.warning?.(`第 ${id} 楼还没有渲染，先在聊天里加载旧消息后再跳转。`, 'SillyTavern Tool Ball');
            return;
        }
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('sttb-flash-message');
        setTimeout(() => element.classList.remove('sttb-flash-message'), 1600);
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

    function renderSearchResults() {
        if (!elements.searchList) {
            return;
        }

        const settings = getSettings();
        const query = settings.searchQuery.trim();
        elements.searchStatus.textContent = query
            ? `${state.searchResults.length} 条结果`
            : '输入关键词搜索当前聊天';

        if (!query) {
            elements.searchList.innerHTML = '<div class="sttb-empty">搜索当前聊天记录</div>';
            return;
        }
        if (!state.searchResults.length) {
            elements.searchList.innerHTML = '<div class="sttb-empty">没有匹配结果</div>';
            return;
        }

        elements.searchList.innerHTML = state.searchResults.map((message, index) => {
            const favorite = Boolean(findFavorite(message.id));
            return `
                <article class="sttb-message-item${index === state.activeResultIndex ? ' active' : ''}">
                    <button type="button" class="sttb-message-main" data-action="jump-message" data-id="${message.id}">
                        <strong>#${message.id} ${escapeHtml(message.name)}</strong>
                        <p>${message.preview}</p>
                    </button>
                    <button type="button" class="sttb-icon-btn" data-action="toggle-favorite" data-id="${message.id}" title="${favorite ? '取消收藏' : '收藏'}">
                        <i class="fa-${favorite ? 'solid' : 'regular'} fa-star"></i>
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
        if (tab === 'search') {
            renderSearchResults();
            setTimeout(() => elements.searchInput?.focus(), 0);
        }
        if (tab === 'favorites') renderFavorites();
    }

    function setPanelOpen(open) {
        elements.panel.classList.toggle('open', open);
        elements.toggle.setAttribute('aria-expanded', String(open));
        if (open) {
            const tab = getSettings().activeTab || 'api';
            setActiveTab(tab);
            positionPanel();
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
        const panelWidth = Math.min(420, window.innerWidth - 24);
        const panelHeight = Math.min(620, window.innerHeight - 24);
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
                    <section class="sttb-view" data-view="search">
                        <label class="sttb-field">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            <input type="search" id="${ID}-search-input" placeholder="搜索当前聊天" autocomplete="off">
                        </label>
                        <div class="sttb-options">
                            <label><input type="checkbox" id="${ID}-case"> 区分大小写</label>
                            <label><input type="checkbox" id="${ID}-names"> 搜索名字</label>
                            <label><input type="checkbox" id="${ID}-hidden"> 包含隐藏</label>
                        </div>
                        <div class="sttb-status" id="${ID}-search-status">输入关键词搜索当前聊天</div>
                        <div class="sttb-list" id="${ID}-search-list"></div>
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
        elements.searchInput = document.getElementById(`${ID}-search-input`);
        elements.caseSensitive = document.getElementById(`${ID}-case`);
        elements.includeNames = document.getElementById(`${ID}-names`);
        elements.includeHidden = document.getElementById(`${ID}-hidden`);
        elements.searchStatus = document.getElementById(`${ID}-search-status`);
        elements.searchList = document.getElementById(`${ID}-search-list`);
        elements.favoriteList = document.getElementById(`${ID}-favorite-list`);

        const settings = getSettings();
        elements.apiFilter.value = settings.apiFilter;
        elements.searchInput.value = settings.searchQuery;
        elements.caseSensitive.checked = Boolean(settings.caseSensitive);
        elements.includeNames.checked = Boolean(settings.includeNames);
        elements.includeHidden.checked = Boolean(settings.includeHidden);

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

        elements.searchInput.addEventListener('input', () => {
            getSettings().searchQuery = elements.searchInput.value;
            saveSettings();
            scheduleSearch();
        });

        elements.caseSensitive.addEventListener('change', () => {
            getSettings().caseSensitive = elements.caseSensitive.checked;
            saveSettings();
            scheduleSearch();
        });
        elements.includeNames.addEventListener('change', () => {
            getSettings().includeNames = elements.includeNames.checked;
            saveSettings();
            scheduleSearch();
        });
        elements.includeHidden.addEventListener('change', () => {
            getSettings().includeHidden = elements.includeHidden.checked;
            saveSettings();
            scheduleSearch();
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
            } else if (actionName === 'toggle-favorite') {
                const message = state.searchResults.find(result => String(result.id) === String(id));
                await toggleFavorite(message);
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
        if (getSettings().searchQuery.trim()) {
            runSearch();
        }
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
