const MODULE_NAME = 'chat_search_jump';
const ID = 'st-chat-search-jump';
const DEFAULT_SETTINGS = Object.freeze({
    caseSensitive: false,
    includeHidden: true,
    includeNames: true,
    maxResults: 300,
});

const state = {
    query: '',
    results: [],
    activeIndex: -1,
    initialized: false,
    searchToken: 0,
};

const elements = {};

function getContext() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function getSettings() {
    const context = getContext();
    if (!context?.extensionSettings) {
        return { ...DEFAULT_SETTINGS };
    }

    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }

    const settings = context.extensionSettings[MODULE_NAME];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = value;
        }
    }

    return settings;
}

function saveSettings() {
    getContext()?.saveSettingsDebounced?.();
}

function setSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    saveSettings();
    scheduleSearch();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }[char]));
}

function stripHtml(value) {
    const element = document.createElement('div');
    element.innerHTML = String(value ?? '');
    return element.textContent || element.innerText || '';
}

function normalize(value, caseSensitive) {
    const text = stripHtml(value);
    return caseSensitive ? text : text.toLocaleLowerCase();
}

function getActiveSwipeText(message) {
    if (!Array.isArray(message?.swipes) || !message.swipes.length) {
        return '';
    }

    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    return message.swipes[swipeId] ?? '';
}

function getMessageText(message) {
    if (typeof message.message === 'string') {
        return message.message;
    }

    const swipe = getActiveSwipeText(message);
    return swipe || message?.mes || '';
}

function getMessageId(message, fallbackId) {
    if (Number.isInteger(message.message_id)) {
        return message.message_id;
    }

    return fallbackId;
}

function getMessageRole(message) {
    if (message.role) {
        return message.role;
    }

    if (message.is_user) {
        return 'user';
    }

    if (message.is_system) {
        return 'system';
    }

    return 'assistant';
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
            include_swipes: false,
        });

        if (!Array.isArray(messages)) {
            return null;
        }

        return messages.map(message => ({
            id: message.message_id,
            name: message.name || '',
            role: message.role || 'assistant',
            hidden: Boolean(message.is_hidden),
            text: message.message || '',
        }));
    } catch (error) {
        console.warn('[Chat Search Jump] Tavern Helper message read failed, using SillyTavern context.', error);
        return null;
    }
}

async function readMessages() {
    const helperMessages = await readMessagesFromTavernHelper();
    if (helperMessages) {
        return helperMessages;
    }

    const chat = getContext()?.chat;
    if (!Array.isArray(chat)) {
        return [];
    }

    return chat
        .map((message, fallbackId) => ({
            id: getMessageId(message, fallbackId),
            name: message?.name || '',
            role: getMessageRole(message),
            hidden: Boolean(message?.is_system),
            text: getMessageText(message),
        }))
        .filter(message => Number.isInteger(message.id));
}

function makeSnippet(text, query, caseSensitive) {
    const plain = stripHtml(text).replace(/\s+/g, ' ').trim();
    if (!plain) {
        return '';
    }

    const haystack = caseSensitive ? plain : plain.toLocaleLowerCase();
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const index = haystack.indexOf(needle);
    const start = Math.max(0, index - 42);
    const end = Math.min(plain.length, index + needle.length + 72);
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

async function runSearch() {
    const token = ++state.searchToken;
    const settings = getSettings();
    const query = elements.input?.value?.trim() ?? '';
    state.query = query;

    if (!query) {
        state.results = [];
        state.activeIndex = -1;
        renderResults();
        return;
    }

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

        const searchable = settings.includeNames
            ? `${message.name}\n${message.text}`
            : message.text;

        if (!normalize(searchable, settings.caseSensitive).includes(needle)) {
            continue;
        }

        results.push({
            id: message.id,
            name: message.name || message.role || 'message',
            role: message.role || '',
            hidden: message.hidden,
            snippet: makeSnippet(searchable, query, settings.caseSensitive),
        });

        if (results.length >= settings.maxResults) {
            break;
        }
    }

    state.results = results;
    state.activeIndex = results.length ? 0 : -1;
    renderResults();
}

let searchTimeout = null;
function scheduleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(runSearch, 120);
}

function renderResults() {
    const count = state.results.length;
    const truncated = count >= getSettings().maxResults ? '+' : '';
    elements.status.textContent = state.query
        ? `${count}${truncated} 条结果`
        : '输入关键词';

    elements.prev.disabled = count === 0;
    elements.next.disabled = count === 0;

    if (!count) {
        elements.list.innerHTML = state.query
            ? '<div class="stcsj-empty">没有找到</div>'
            : '<div class="stcsj-empty">搜索当前聊天记录</div>';
        return;
    }

    elements.list.innerHTML = state.results.map((result, index) => `
        <button class="stcsj-result ${index === state.activeIndex ? 'active' : ''}" data-index="${index}" type="button">
            <span class="stcsj-result-meta">
                <span>#${result.id}</span>
                <span>${escapeHtml(result.name)}</span>
                ${result.hidden ? '<span>hidden</span>' : ''}
            </span>
            <span class="stcsj-result-snippet">${result.snippet}</span>
        </button>
    `).join('');
}

function findMessageElement(messageId) {
    return document.querySelector(`.mes[mesid="${messageId}"]`);
}

function getFirstRenderedMessageId() {
    const firstMessage = document.querySelector('.mes[mesid]');
    if (!firstMessage) {
        return null;
    }

    const id = Number(firstMessage.getAttribute('mesid'));
    return Number.isFinite(id) ? id : null;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureMessageRendered(messageId) {
    let element = findMessageElement(messageId);
    if (element) {
        return element;
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
        const showMore = document.querySelector('#show_more_messages');
        const firstRenderedId = getFirstRenderedMessageId();

        if (!showMore || (firstRenderedId !== null && messageId >= firstRenderedId)) {
            break;
        }

        showMore.click();
        await wait(140);
        element = findMessageElement(messageId);
        if (element) {
            return element;
        }
    }

    return findMessageElement(messageId);
}

function flashMessage(element) {
    document.querySelectorAll('.stcsj-hit').forEach(node => node.classList.remove('stcsj-hit'));
    element.classList.add('stcsj-hit');
    setTimeout(() => element.classList.remove('stcsj-hit'), 2400);
}

async function jumpToResult(index) {
    const result = state.results[index];
    if (!result) {
        return;
    }

    state.activeIndex = index;
    renderResults();

    const element = await ensureMessageRendered(result.id);
    if (!element) {
        globalThis.toastr?.warning?.(`找不到第 ${result.id} 楼，可能当前聊天未完全加载。`, 'Chat Search Jump');
        return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashMessage(element);
}

function jumpRelative(delta) {
    if (!state.results.length) {
        return;
    }

    const nextIndex = (state.activeIndex + delta + state.results.length) % state.results.length;
    jumpToResult(nextIndex);
}

function openPanel() {
    elements.panel.classList.add('open');
    elements.toggle.setAttribute('aria-expanded', 'true');
    setTimeout(() => elements.input.focus(), 0);
    if (elements.input.value.trim()) {
        scheduleSearch();
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
        openPanel();
    }
}

function syncSettingsToUi() {
    const settings = getSettings();
    elements.caseSensitive.checked = Boolean(settings.caseSensitive);
    elements.includeHidden.checked = Boolean(settings.includeHidden);
    elements.includeNames.checked = Boolean(settings.includeNames);
}

function createUi() {
    if (document.getElementById(`${ID}-panel`)) {
        return;
    }

    document.body.insertAdjacentHTML('beforeend', `
        <button id="${ID}-toggle" class="stcsj-toggle" type="button" title="搜索聊天记录" aria-label="搜索聊天记录" aria-expanded="false">
            <i class="fa-solid fa-magnifying-glass"></i>
        </button>
        <section id="${ID}-panel" class="stcsj-panel" aria-label="聊天记录搜索">
            <div class="stcsj-header">
                <input id="${ID}-input" type="search" autocomplete="off" placeholder="搜索当前聊天..." />
                <button id="${ID}-close" class="stcsj-icon-btn" type="button" title="关闭" aria-label="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="stcsj-options">
                <label><input id="${ID}-case" type="checkbox" /> 区分大小写</label>
                <label><input id="${ID}-names" type="checkbox" /> 搜索名字</label>
                <label><input id="${ID}-hidden" type="checkbox" /> 包含隐藏</label>
            </div>
            <div class="stcsj-actions">
                <span id="${ID}-status">输入关键词</span>
                <button id="${ID}-prev" class="stcsj-icon-btn" type="button" title="上一个" aria-label="上一个" disabled>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button id="${ID}-next" class="stcsj-icon-btn" type="button" title="下一个" aria-label="下一个" disabled>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <div id="${ID}-list" class="stcsj-list">
                <div class="stcsj-empty">搜索当前聊天记录</div>
            </div>
        </section>
    `);

    elements.toggle = document.getElementById(`${ID}-toggle`);
    elements.panel = document.getElementById(`${ID}-panel`);
    elements.input = document.getElementById(`${ID}-input`);
    elements.close = document.getElementById(`${ID}-close`);
    elements.caseSensitive = document.getElementById(`${ID}-case`);
    elements.includeHidden = document.getElementById(`${ID}-hidden`);
    elements.includeNames = document.getElementById(`${ID}-names`);
    elements.prev = document.getElementById(`${ID}-prev`);
    elements.next = document.getElementById(`${ID}-next`);
    elements.status = document.getElementById(`${ID}-status`);
    elements.list = document.getElementById(`${ID}-list`);

    syncSettingsToUi();

    elements.toggle.addEventListener('click', togglePanel);
    elements.close.addEventListener('click', closePanel);
    elements.input.addEventListener('input', scheduleSearch);
    elements.caseSensitive.addEventListener('change', () => setSetting('caseSensitive', elements.caseSensitive.checked));
    elements.includeHidden.addEventListener('change', () => setSetting('includeHidden', elements.includeHidden.checked));
    elements.includeNames.addEventListener('change', () => setSetting('includeNames', elements.includeNames.checked));
    elements.prev.addEventListener('click', () => jumpRelative(-1));
    elements.next.addEventListener('click', () => jumpRelative(1));
    elements.list.addEventListener('click', event => {
        const button = event.target.closest('.stcsj-result');
        if (!button) {
            return;
        }

        jumpToResult(Number(button.dataset.index));
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && elements.panel.classList.contains('open')) {
            closePanel();
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLocaleLowerCase() === 'f') {
            event.preventDefault();
            togglePanel();
            return;
        }

        if (!elements.panel.classList.contains('open')) {
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'g') {
            event.preventDefault();
            jumpRelative(event.shiftKey ? -1 : 1);
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
    renderResults();
}

function init() {
    if (state.initialized) {
        return;
    }

    state.initialized = true;
    createUi();

    const context = getContext();
    const eventTypes = context?.eventTypes ?? context?.event_types;
    if (context?.eventSource && eventTypes?.CHAT_CHANGED) {
        const on = (eventType, handler) => {
            if (eventType) {
                context.eventSource.on(eventType, handler);
            }
        };

        on(eventTypes.CHAT_CHANGED, clearOnChatChange);
        on(eventTypes.MESSAGE_EDITED, scheduleSearch);
        on(eventTypes.MESSAGE_DELETED, scheduleSearch);
        on(eventTypes.USER_MESSAGE_RENDERED, scheduleSearch);
        on(eventTypes.CHARACTER_MESSAGE_RENDERED, scheduleSearch);
    }

    console.info('[Chat Search Jump] loaded');
}

function waitForSillyTavern(attempt = 0) {
    const context = getContext();
    const eventTypes = context?.eventTypes ?? context?.event_types;
    if (context?.eventSource && eventTypes?.APP_READY) {
        context.eventSource.on(eventTypes.APP_READY, init);
        return;
    }

    if (attempt > 80) {
        console.warn('[Chat Search Jump] SillyTavern context was not found.');
        return;
    }

    setTimeout(() => waitForSillyTavern(attempt + 1), 250);
}

waitForSillyTavern();
