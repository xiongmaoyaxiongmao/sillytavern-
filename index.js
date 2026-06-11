const MODULE_NAME = 'chat_search_jump';
const ID = 'st-chat-search-jump';
const DEFAULT_SETTINGS = Object.freeze({
    caseSensitive: false,
    includeHidden: true,
    includeNames: true,
    maxResults: 300,
    ballX: null,
    ballY: null,
});

const state = {
    query: '',
    results: [],
    activeIndex: -1,
    activeOccurrence: 0,
    initialized: false,
    toolsOpen: false,
    currentProfile: '',
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
        console.error('[SillyTavern Tool Ball] Slash command failed:', command, error);
    }

    return '';
}

function quoteSlashArg(value) {
    const text = String(value ?? '');
    return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

async function getProfiles() {
    const raw = await runSlashCommand('/profile-list');
    try {
        const profiles = JSON.parse(raw);
        return Array.isArray(profiles) ? profiles : [];
    } catch {
        return [];
    }
}

async function getCurrentProfile() {
    return (await runSlashCommand('/profile')).trim();
}

async function switchProfile(name) {
    await runSlashCommand(`/profile ${quoteSlashArg(name)}`);
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
            matchCount: Math.max(1, countOccurrences(message.text, query, settings.caseSensitive)),
            snippet: makeSnippet(searchable, query, settings.caseSensitive),
        });

        if (results.length >= settings.maxResults) {
            break;
        }
    }

    state.results = results;
    state.activeIndex = results.length ? 0 : -1;
    state.activeOccurrence = 0;
    renderResults();
}

let searchTimeout = null;
function scheduleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(runSearch, 120);
}

function renderResults() {
    const count = state.results.length;
    const activeResult = state.results[state.activeIndex];
    const hitCount = activeResult?.matchCount ?? 0;
    const truncated = count >= getSettings().maxResults ? '+' : '';
    elements.status.textContent = state.query
        ? `${count}${truncated} 条结果`
        : '输入关键词';

    elements.prev.disabled = count === 0;
    elements.next.disabled = count === 0;
    elements.hitPrev.disabled = hitCount <= 1;
    elements.hitNext.disabled = hitCount <= 1;
    elements.hitStatus.textContent = hitCount
        ? `命中 ${Math.min(state.activeOccurrence + 1, hitCount)}/${hitCount}`
        : '命中 0/0';
    elements.hitNav.hidden = hitCount <= 1;

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
                <span>命中 ${result.matchCount}</span>
                ${result.hidden ? '<span>hidden</span>' : ''}
            </span>
            <span class="stcsj-result-snippet">${result.snippet}</span>
        </button>
    `).join('');
}

function renderToolPanelLoading() {
    elements.toolPanel.innerHTML = `
        <div class="stcsj-tool-title">
            <span>酒馆工具</span>
            <i class="fa-solid fa-wand-magic-sparkles"></i>
        </div>
        <button id="${ID}-open-search" class="stcsj-tool-action" type="button">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>聊天搜索</span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
        <div class="stcsj-tool-section-title">API 配置</div>
        <div class="stcsj-tool-empty">读取配置中...</div>
    `;
    elements.toolPanel.querySelector(`#${ID}-open-search`)?.addEventListener('click', () => {
        closeToolPanel();
        openPanel();
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

    const profileHtml = profiles.length
        ? profiles.map(name => {
            const active = name === current;
            return `
                <button class="stcsj-profile-item ${active ? 'active' : ''}" data-profile="${escapeHtml(name)}" type="button">
                    <span>${escapeHtml(name)}</span>
                    ${active ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-chevron-right"></i>'}
                </button>
            `;
        }).join('')
        : '<div class="stcsj-tool-empty">没有找到连接配置。请确认 Connection Profiles 已启用。</div>';

    elements.toolPanel.innerHTML = `
        <div class="stcsj-tool-title">
            <span>酒馆工具</span>
            <i class="fa-solid fa-wand-magic-sparkles"></i>
        </div>
        <button id="${ID}-open-search" class="stcsj-tool-action" type="button">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>聊天搜索</span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
        <div class="stcsj-tool-section-title">API 配置</div>
        <div class="stcsj-current-profile">
            <span>当前</span>
            <strong>${escapeHtml(current || '未知')}</strong>
        </div>
        <div class="stcsj-profile-list">${profileHtml}</div>
        <button id="${ID}-refresh-profiles" class="stcsj-tool-refresh" type="button">
            <i class="fa-solid fa-rotate"></i>
            <span>刷新</span>
        </button>
    `;

    elements.toolPanel.querySelector(`#${ID}-open-search`)?.addEventListener('click', () => {
        closeToolPanel();
        openPanel();
    });
    elements.toolPanel.querySelector(`#${ID}-refresh-profiles`)?.addEventListener('click', renderToolPanel);
    elements.toolPanel.querySelectorAll('.stcsj-profile-item').forEach(item => {
        item.addEventListener('click', async () => {
            const name = item.getAttribute('data-profile');
            if (!name || name === state.currentProfile) {
                closeToolPanel();
                return;
            }

            item.classList.add('loading');
            await switchProfile(name);
            state.currentProfile = await getCurrentProfile() || name;
            updateToolBallTitle();
            globalThis.toastr?.success?.(`已切换到：${name}`, 'SillyTavern Tool Ball');
            closeToolPanel();
        });
    });
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

function clearOccurrenceHighlight() {
    if (globalThis.CSS?.highlights) {
        CSS.highlights.delete('stcsj-current-hit');
    }
}

function getMessageSearchRoot(element) {
    return element.querySelector('.mes_text') || element;
}

function createRangeAt(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            if (parent?.closest('.stcsj-panel, script, style')) {
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
        const nextOffset = offset + node.nodeValue.length;

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
    renderResults();
    return true;
}

async function jumpToResult(index, occurrenceIndex = 0) {
    const result = state.results[index];
    if (!result) {
        return;
    }

    state.activeIndex = index;
    state.activeOccurrence = occurrenceIndex;
    renderResults();

    const element = await ensureMessageRendered(result.id);
    if (!element) {
        globalThis.toastr?.warning?.(`找不到第 ${result.id} 楼，可能当前聊天未完全加载。`, 'Chat Search Jump');
        return;
    }

    if (!highlightOccurrence(element, occurrenceIndex)) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashMessage(element);
    }
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
    elements.toggle.title = state.currentProfile
        ? `酒馆工具｜当前 API：${state.currentProfile}`
        : '酒馆工具';
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
    const width = elements.toggle.offsetWidth || 48;
    const height = elements.toggle.offsetHeight || 48;
    settings.ballX = Math.max(8, Math.min(settings.ballX, window.innerWidth - width - 8));
    settings.ballY = Math.max(8, Math.min(settings.ballY, window.innerHeight - height - 8));
    setBallPosition(settings.ballX, settings.ballY);
}

function positionToolPanel() {
    const settings = getBallSettings();
    const panelWidth = 292;
    const panelHeight = 420;
    const ballWidth = elements.toggle.offsetWidth || 48;
    const ballHeight = elements.toggle.offsetHeight || 48;
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
        } catch {}
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
        } catch {}

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
    if (document.getElementById(`${ID}-panel`)) {
        return;
    }

    document.body.insertAdjacentHTML('beforeend', `
        <button id="${ID}-toggle" class="stcsj-tool-ball" type="button" title="酒馆工具" aria-label="酒馆工具" aria-expanded="false">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
        </button>
        <section id="${ID}-tool-panel" class="stcsj-tool-panel" aria-label="酒馆工具面板"></section>
        <section id="${ID}-panel" class="stcsj-panel" aria-label="聊天记录搜索">
            <div class="stcsj-header">
                <label class="stcsj-search-field" for="${ID}-input">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="${ID}-input" type="search" autocomplete="off" placeholder="搜索当前聊天..." />
                </label>
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
            <div id="${ID}-hit-nav" class="stcsj-hit-nav" hidden>
                <button id="${ID}-hit-prev" class="stcsj-icon-btn" type="button" title="上一处命中" aria-label="上一处命中" disabled>
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <span id="${ID}-hit-status">命中 0/0</span>
                <button id="${ID}-hit-next" class="stcsj-icon-btn" type="button" title="下一处命中" aria-label="下一处命中" disabled>
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
            <div id="${ID}-list" class="stcsj-list">
                <div class="stcsj-empty">搜索当前聊天记录</div>
            </div>
        </section>
    `);

    elements.toggle = document.getElementById(`${ID}-toggle`);
    elements.toolPanel = document.getElementById(`${ID}-tool-panel`);
    elements.panel = document.getElementById(`${ID}-panel`);
    elements.input = document.getElementById(`${ID}-input`);
    elements.close = document.getElementById(`${ID}-close`);
    elements.caseSensitive = document.getElementById(`${ID}-case`);
    elements.includeHidden = document.getElementById(`${ID}-hidden`);
    elements.includeNames = document.getElementById(`${ID}-names`);
    elements.prev = document.getElementById(`${ID}-prev`);
    elements.next = document.getElementById(`${ID}-next`);
    elements.hitNav = document.getElementById(`${ID}-hit-nav`);
    elements.hitPrev = document.getElementById(`${ID}-hit-prev`);
    elements.hitNext = document.getElementById(`${ID}-hit-next`);
    elements.hitStatus = document.getElementById(`${ID}-hit-status`);
    elements.status = document.getElementById(`${ID}-status`);
    elements.list = document.getElementById(`${ID}-list`);
    clampToolBall();
    attachToolBallDrag();
    syncSettingsToUi();

    elements.close.addEventListener('click', closePanel);
    elements.input.addEventListener('input', scheduleSearch);
    elements.caseSensitive.addEventListener('change', () => setSetting('caseSensitive', elements.caseSensitive.checked));
    elements.includeHidden.addEventListener('change', () => setSetting('includeHidden', elements.includeHidden.checked));
    elements.includeNames.addEventListener('change', () => setSetting('includeNames', elements.includeNames.checked));
    elements.prev.addEventListener('click', () => jumpRelative(-1));
    elements.next.addEventListener('click', () => jumpRelative(1));
    elements.hitPrev.addEventListener('click', () => jumpOccurrence(-1));
    elements.hitNext.addEventListener('click', () => jumpOccurrence(1));
    elements.list.addEventListener('click', event => {
        const button = event.target.closest('.stcsj-result');
        if (!button) {
            return;
        }

        jumpToResult(Number(button.dataset.index));
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

        if (!elements.panel.classList.contains('open')) {
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
    clearOccurrenceHighlight();
    renderResults();
}

function init() {
    if (state.initialized) {
        return;
    }

    state.initialized = true;
    createUi();
    getCurrentProfile().then(profile => {
        state.currentProfile = profile;
        updateToolBallTitle();
    });
    window.setInterval(async () => {
        state.currentProfile = await getCurrentProfile();
        updateToolBallTitle();
    }, 30000);

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
        setTimeout(init, 800);
        return;
    }

    if (context?.chat && document.body) {
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
