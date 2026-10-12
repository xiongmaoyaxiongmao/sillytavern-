'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 30;
  const MESSAGE_PAGE_SIZE = 80;
  const state = {
    searchSequence: 0, searchController: null, searchSnapshot: null,
    searchOffset: 0, searchData: null, lastRequestedSearch: null,
    readerSequence: 0, readerController: null, readerData: null,
    selectedId: null, selectedSummary: null, focusedNumber: null,
    readerSnapshot: null, readerStart: 0,
    matchSequence: 0, matchController: null, matches: [], matchError: false,
    status: null, statusFailure: false, seenIndexVersion: null,
    indexWasRunning: false, polling: null, refreshing: false,
    toastTimer: null, charactersSequence: 0,
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function number(value) { return Number(value || 0).toLocaleString('zh-CN'); }

  function date(value, withTime = true) {
    if (value === null || value === undefined || value === '') return '';
    let raw = value;
    if (typeof raw === 'number' || /^\d{10,13}(\.\d+)?$/.test(String(raw))) {
      raw = Number(raw);
      if (raw < 1e12) raw *= 1000;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    });
  }

  function snapshotFromForm() {
    return Object.freeze({
      q: $('query').value.trim().split(/\s+/u).filter(Boolean).join(' '),
      character: $('character').value,
      role: $('role').value,
      include_hidden: $('include-hidden').checked ? '1' : '0',
    });
  }

  function highlight(text, query) {
    const fragment = document.createDocumentFragment();
    const raw = String(text ?? '');
    const normalize = (value) => String(value).normalize('NFKC').toLowerCase();
    const terms = [...new Set(normalize(query || '').split(/\s+/u).filter(Boolean))]
      .sort((a, b) => b.length - a.length);
    if (!terms.length) { fragment.append(document.createTextNode(raw)); return fragment; }
    // Search and highlight use the same normalization; keep original text offsets.
    const starts = [], ends = [];
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(raw);
    for (const { segment, index } of segments) {
      for (let i = 0; i < normalize(segment).length; i++) {
        starts.push(index); ends.push(index + segment.length);
      }
    }
    const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const matcher = new RegExp(escaped.join('|'), 'gu');
    let last = 0;
    for (const match of normalize(raw).matchAll(matcher)) {
      const start = starts[match.index], end = ends[match.index + match[0].length - 1];
      if (start === undefined || end === undefined || end <= last) continue;
      if (start > last) fragment.append(document.createTextNode(raw.slice(last, start)));
      fragment.append(node('mark', '', raw.slice(Math.max(last, start), end)));
      last = end;
    }
    if (last < raw.length) fragment.append(document.createTextNode(raw.slice(last)));
    return fragment;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options });
    let data;
    try { data = await response.json(); } catch { throw new Error('服务返回了无法读取的内容，请检查本地工具是否仍在运行。'); }
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  function errorText(error) {
    if (error instanceof TypeError) return '无法连接本地服务，请确认存档拾光仍在运行。';
    return error?.message || '读取失败，请稍后重试。';
  }

  function toast(message, isError = false) {
    clearTimeout(state.toastTimer);
    const target = $('toast');
    target.textContent = message;
    target.classList.toggle('is-error', isError);
    target.hidden = false;
    state.toastTimer = setTimeout(() => { target.hidden = true; }, isError ? 6000 : 2800);
  }

  async function copy(text, success) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(String(text));
      else {
        const previousFocus = document.activeElement;
        const field = node('textarea', 'sr-only', String(text));
        field.setAttribute('readonly', '');
        document.body.append(field);
        field.select();
        const ok = document.execCommand('copy');
        field.remove();
        previousFocus?.focus({ preventScroll: true });
        if (!ok) throw new Error('复制失败');
      }
      toast(success);
    } catch { toast('复制失败。请选中文本后手动复制，或检查浏览器的剪贴板权限。', true); }
  }

  function emptyState(title, description, retry) {
    const element = node('div', 'empty-state');
    element.append(node('span', 'empty-symbol', '⋯'), node('h3', '', title), node('p', '', description));
    if (retry) {
      const button = node('button', 'button button-subtle', '重试');
      button.type = 'button'; button.addEventListener('click', retry); element.append(button);
    }
    return element;
  }

  function searchParams(snapshot, extras = {}) {
    return new URLSearchParams({ ...snapshot, ...extras }).toString();
  }

  function setSearchBusy(busy) {
    $('results').setAttribute('aria-busy', String(busy));
    $('search-progress').hidden = !busy;
    $('results-prev').disabled = busy || !state.searchData || state.searchOffset <= 0;
    $('results-next').disabled = busy || !state.searchData || state.searchOffset + PAGE_SIZE >= state.searchData.total_chats;
  }

  async function search(snapshot = snapshotFromForm(), offset = 0, preserveScroll = false) {
    const sequence = ++state.searchSequence;
    state.searchController?.abort();
    state.searchController = new AbortController();
    state.lastRequestedSearch = { snapshot, offset };
    setSearchBusy(true);
    const previousScroll = $('results').scrollTop;
    try {
      const data = await request(`/api/search?${searchParams(snapshot, { offset, limit: PAGE_SIZE })}`, { signal: state.searchController.signal });
      if (sequence !== state.searchSequence) return;
      if (offset > 0 && !data.chats.length && data.total_chats > 0) {
        await search(snapshot, Math.floor((data.total_chats - 1) / PAGE_SIZE) * PAGE_SIZE, preserveScroll);
        return;
      }
      state.searchSnapshot = snapshot;
      state.searchOffset = offset;
      state.searchData = data;
      renderResults();
      $('results').scrollTop = preserveScroll ? previousScroll : 0;
      if (state.selectedId) {
        state.readerSnapshot = snapshot;
        refreshHighlights();
        loadMatches(state.selectedId, snapshot);
      }
    } catch (error) {
      if (sequence !== state.searchSequence || error.name === 'AbortError') return;
      $('result-count').textContent = '读取失败';
      $('results-pagination').hidden = true;
      $('results').replaceChildren(emptyState('没能读取存档', errorText(error), () => search(snapshot, offset)));
    } finally {
      if (sequence === state.searchSequence) setSearchBusy(false);
    }
  }

  function renderResults() {
    const data = state.searchData;
    const snapshot = state.searchSnapshot;
    $('results-title').textContent = snapshot.q ? '搜索结果' : '全部存档';
    $('result-count').textContent = snapshot.q
      ? `${number(data.total_chats)} 份存档 · ${number(data.total_matches)} 条命中`
      : `${number(data.total_chats)} 份存档`;
    const fragment = document.createDocumentFragment();
    if (!data.chats.length) {
      const indexing = state.status?.indexing;
      fragment.append(emptyState(
        indexing ? '正在整理存档' : snapshot.q ? '暂时没有找到' : '这里还没有存档',
        indexing ? '首轮扫描完成后，结果会自动出现。' : snapshot.q
          ? '试试更短的词语，或放宽角色、说话方和隐藏消息筛选。'
          : snapshot.character || snapshot.role ? '试试清空筛选，查看其他角色的存档。' : '可在下方查看存档来源，然后点击“更新索引”重新扫描。',
      ));
    }
    for (const chat of data.chats) {
      const card = node('article', 'chat-card');
      card.dataset.chatId = chat.id;
      card.classList.toggle('is-selected', chat.id === state.selectedId);
      const open = node('button', 'chat-open');
      open.type = 'button';
      open.setAttribute('aria-label', `打开 ${chat.character || '未命名角色'} 的存档：${chat.title}`);
      open.setAttribute('aria-pressed', String(chat.id === state.selectedId));
      const topline = node('div', 'card-topline');
      topline.append(node('span', 'card-character', chat.character || '未命名角色'));
      if (snapshot.q) topline.append(node('span', 'hit-badge', `${number(chat.hit_count)} 条命中`));
      const meta = node('div', 'card-meta');
      meta.append(node('span', '', `${number(chat.message_count)} 条消息`), node('span', '', date(chat.mtime)));
      open.append(topline, node('p', 'card-title', chat.title), meta);
      open.addEventListener('click', () => openChat(chat, snapshot, snapshot.q ? chat.snippets?.[0]?.number : null));
      card.append(open);
      if (chat.snippets?.length) {
        const snippets = node('div', 'snippets');
        for (const snippet of chat.snippets) {
          const button = node('button', 'snippet');
          button.type = 'button';
          button.setAttribute('aria-label', `阅读第 ${snippet.number} 楼，${snippet.name || roleName(snippet.role)}：${snippet.text}`);
          button.append(node('span', 'snippet-label', `${snapshot.q ? '命中' : '最近对话'} · 第 ${snippet.number} 楼 · ${snippet.name || roleName(snippet.role)}`));
          const text = node('span', 'snippet-text');
          text.append(highlight(snippet.text, snapshot.q)); button.append(text);
          button.addEventListener('click', () => openChat(chat, snapshot, snippet.number));
          snippets.append(button);
        }
        card.append(snippets);
      }
      fragment.append(card);
    }
    $('results').replaceChildren(fragment);
    $('results-pagination').hidden = data.total_chats <= PAGE_SIZE;
    $('results-page').textContent = `${number(Math.floor(state.searchOffset / PAGE_SIZE) + 1)} / ${number(Math.max(1, Math.ceil(data.total_chats / PAGE_SIZE)))}`;
  }

  function roleName(role) {
    return ({ user: '用户', assistant: '角色', character: '角色', system: '系统' })[role] || '角色';
  }

  function markSelectedCard() {
    for (const card of $('results').querySelectorAll('.chat-card')) {
      const selected = card.dataset.chatId === state.selectedId;
      card.classList.toggle('is-selected', selected);
      card.querySelector('.chat-open').setAttribute('aria-pressed', String(selected));
    }
  }

  function setReaderStatus(message, isError = false, retry) {
    const target = $('reader-status');
    target.replaceChildren(document.createTextNode(message || ''));
    target.classList.toggle('is-error', isError);
    target.hidden = !message;
    if (retry) {
      const button = node('button', 'text-button', '重试');
      button.type = 'button'; button.addEventListener('click', retry); target.append(button);
    }
  }

  function openChat(chat, snapshot, targetNumber = null) {
    state.selectedId = chat.id;
    state.selectedSummary = chat;
    state.readerSnapshot = snapshot;
    state.focusedNumber = Number.isInteger(targetNumber) ? targetNumber : null;
    state.matches = [];
    state.matchError = false;
    state.readerData = null;
    $('reader-empty').hidden = true;
    $('reader-content').hidden = false;
    $('reader-character').textContent = chat.character || '聊天存档';
    $('reader-title').textContent = chat.title || '未命名存档';
    $('reader-meta').textContent = `${number(chat.message_count)} 条消息 · ${date(chat.mtime)}`;
    $('copy-path').disabled = true;
    $('messages').replaceChildren();
    document.body.classList.add('reading-open');
    markSelectedCard();
    renderMatchControls();
    const start = targetNumber === null ? 0 : Math.floor(targetNumber / MESSAGE_PAGE_SIZE) * MESSAGE_PAGE_SIZE;
    loadReaderPage(start, targetNumber);
    loadMatches(chat.id, snapshot);
    $('reader-title').focus({ preventScroll: true });
  }

  async function loadReaderPage(start, targetNumber = null) {
    const id = state.selectedId;
    if (!id) return;
    const sequence = ++state.readerSequence;
    state.readerController?.abort();
    state.readerController = new AbortController();
    $('messages').setAttribute('aria-busy', 'true');
    $('messages-prev').disabled = true;
    $('messages-next').disabled = true;
    setReaderStatus('正在读取聊天记录…');
    try {
      const data = await request(`/api/chat?${new URLSearchParams({ id, start, limit: MESSAGE_PAGE_SIZE })}`, { signal: state.readerController.signal });
      if (sequence !== state.readerSequence || id !== state.selectedId) return;
      state.readerData = data;
      state.readerStart = data.start;
      state.focusedNumber = Number.isInteger(targetNumber) ? targetNumber : data.messages[0]?.number ?? null;
      $('reader-character').textContent = data.chat.character || '聊天存档';
      $('reader-title').textContent = data.chat.title || '未命名存档';
      $('reader-meta').textContent = `${number(data.total)} 条消息 · ${date(data.chat.mtime)}`;
      $('copy-path').disabled = !data.chat.path;
      $('copy-path').title = data.chat.path || '';
      renderMessages();
      renderReaderPagination();
      renderMatchControls();
      setReaderStatus(state.matchError ? '聊天已打开，但命中位置读取失败。重新搜索或重开存档可以重试。' : '');
      if (Number.isInteger(targetNumber)) scrollToMessage(targetNumber);
      else $('messages').scrollTop = 0;
    } catch (error) {
      if (sequence !== state.readerSequence || error.name === 'AbortError') return;
      setReaderStatus(errorText(error), true, () => loadReaderPage(start, targetNumber));
      if (state.readerData) renderReaderPagination();
      else {
        $('messages').replaceChildren(emptyState('聊天记录暂时无法打开', '可以重试，或选择另一份存档。'));
        $('reader-range').textContent = ''; $('message-page').textContent = '';
      }
    } finally {
      if (sequence === state.readerSequence) $('messages').setAttribute('aria-busy', 'false');
    }
  }

  function renderMessages() {
    const data = state.readerData;
    if (!data) return;
    const fragment = document.createDocumentFragment();
    if (!data.messages.length) fragment.append(emptyState('这份存档里没有消息', '聊天记录可能还没有开始，或记录已被移走。'));
    for (const message of data.messages) {
      const article = node('article', 'message');
      article.dataset.messageNumber = String(message.number);
      article.id = `message-${message.number}`;
      article.classList.toggle('is-user', message.role === 'user');
      article.classList.toggle('is-system', message.role === 'system');
      article.classList.toggle('is-hidden', Boolean(message.hidden));
      article.classList.toggle('is-focused', message.number === state.focusedNumber);
      const header = node('div', 'message-header');
      header.append(node('span', 'message-name', message.name || roleName(message.role)), node('span', 'message-floor', `第 ${message.number} 楼`));
      if (message.send_date) header.append(node('span', '', date(message.send_date)));
      if (message.hidden) header.append(node('span', 'message-hidden', '隐藏消息'));
      const copyButton = node('button', 'text-button message-copy', '复制');
      copyButton.type = 'button';
      copyButton.setAttribute('aria-label', `复制第 ${message.number} 楼的消息`);
      copyButton.addEventListener('click', () => copy(message.text, `已复制第 ${message.number} 楼的文本`));
      header.append(copyButton);
      const body = node('div', message.text ? 'message-text' : 'message-text message-empty');
      if (message.text) body.append(highlight(message.text, state.readerSnapshot?.q));
      else body.textContent = '（这条消息没有文本内容）';
      article.append(header, body); fragment.append(article);
    }
    $('messages').replaceChildren(fragment);
  }

  function refreshHighlights() {
    if (!state.readerData) return;
    // Replace only text contents: reading position and focused controls stay intact.
    for (const message of state.readerData.messages) {
      const body = document.getElementById(`message-${message.number}`)?.querySelector('.message-text');
      if (body && message.text) body.replaceChildren(highlight(message.text, state.readerSnapshot?.q));
    }
  }

  function renderReaderPagination() {
    const data = state.readerData;
    if (!data) return;
    $('messages-prev').disabled = data.start <= 0;
    $('messages-next').disabled = !data.has_more;
    const first = data.messages[0]?.number;
    const last = data.messages.at(-1)?.number;
    $('reader-range').textContent = data.messages.length ? `第 ${first}–${last} 楼 / ${number(data.total)} 条` : '0 条消息';
    $('message-page').textContent = `${number(Math.floor(data.start / MESSAGE_PAGE_SIZE) + 1)} / ${number(Math.max(1, Math.ceil(data.total / MESSAGE_PAGE_SIZE)))} 页`;
  }

  async function loadMatches(id, snapshot) {
    const sequence = ++state.matchSequence;
    state.matchController?.abort();
    state.matchController = new AbortController();
    state.matches = [];
    state.matchError = false;
    renderMatchControls(Boolean(snapshot.q));
    if (!snapshot.q) return;
    try {
      const data = await request(`/api/matches?${searchParams(snapshot, { id })}`, { signal: state.matchController.signal });
      if (sequence !== state.matchSequence || id !== state.selectedId) return;
      state.matches = data.numbers;
      renderMatchControls();
    } catch (error) {
      if (sequence !== state.matchSequence || error.name === 'AbortError') return;
      state.matchError = true;
      renderMatchControls();
      setReaderStatus(`命中位置读取失败：${errorText(error)}`, true, () => loadMatches(id, snapshot));
    }
  }

  function renderMatchControls(loading = false) {
    const snapshot = state.readerSnapshot;
    const activeIndex = state.matches.indexOf(state.focusedNumber);
    $('match-prev').disabled = loading || !state.matches.length;
    $('match-next').disabled = loading || !state.matches.length;
    $('match-counter').textContent = loading ? '查找命中位置…'
      : state.matchError ? '命中位置读取失败'
      : !snapshot?.q ? '完整聊天'
      : !state.matches.length ? '当前筛选下没有命中'
      : activeIndex >= 0 ? `${number(activeIndex + 1)} / ${number(state.matches.length)} 处命中`
      : `${number(state.matches.length)} 处命中`;
    const queryLabel = $('reader-query');
    queryLabel.hidden = !snapshot?.q;
    if (snapshot?.q) {
      const extras = [];
      if (snapshot.role) extras.push(`说话方：${roleName(snapshot.role)}`);
      if (snapshot.include_hidden === '1') extras.push('含隐藏消息');
      queryLabel.textContent = `查找：${snapshot.q}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
    }
  }

  function scrollToMessage(targetNumber) {
    requestAnimationFrame(() => {
      const target = document.getElementById(`message-${targetNumber}`);
      if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }

  function jumpToMatch(direction) {
    if (!state.matches.length) return;
    const current = state.matches.indexOf(state.focusedNumber);
    let index;
    if (current >= 0) index = (current + direction + state.matches.length) % state.matches.length;
    else if (direction > 0) {
      index = state.matches.findIndex((value) => value >= (state.focusedNumber ?? 0));
      if (index < 0) index = 0;
    } else {
      index = state.matches.findLastIndex((value) => value <= (state.focusedNumber ?? Infinity));
      if (index < 0) index = state.matches.length - 1;
    }
    const target = state.matches[index];
    state.focusedNumber = target;
    renderMatchControls();
    const message = document.getElementById(`message-${target}`);
    if (message && state.readerData) {
      for (const item of $('messages').querySelectorAll('.message')) item.classList.toggle('is-focused', item === message);
      scrollToMessage(target);
    } else loadReaderPage(Math.floor(target / MESSAGE_PAGE_SIZE) * MESSAGE_PAGE_SIZE, target);
  }

  async function loadCharacters() {
    const sequence = ++state.charactersSequence;
    try {
      const data = await request('/api/characters');
      if (sequence !== state.charactersSequence) return;
      const selected = $('character').value;
      const options = [node('option', '', '全部角色')]; options[0].value = '';
      for (const character of data.characters) {
        const option = node('option', '', `${character.name}（${number(character.count)}）`);
        option.value = character.name; options.push(option);
      }
      if (selected && !data.characters.some((character) => character.name === selected)) {
        const option = node('option', '', `${selected}（当前无存档）`);
        option.value = selected; options.push(option);
      }
      $('character').replaceChildren(...options); $('character').value = selected;
      $('character').title = '';
    } catch (error) {
      $('character').title = `角色列表读取失败：${errorText(error)}`;
    }
  }

  function renderStatus(data) {
    const copy = $('index-status').parentElement;
    copy.classList.toggle('is-indexing', Boolean(data.indexing));
    copy.classList.toggle('is-error', Boolean(data.error));
    if (data.indexing) {
      $('index-status').textContent = data.phase === 'keywords' ? '正在整理关键词索引…' : data.total ? `正在扫描 ${number(data.processed)} / ${number(data.total)} 份存档` : '正在寻找聊天存档…';
      $('index-detail').textContent = '完成后自动更新搜索结果';
    } else {
      $('index-status').textContent = `${number(data.chat_count)} 份存档 · ${number(data.message_count)} 条消息`;
      $('index-detail').textContent = data.last_updated ? `更新于 ${date(data.last_updated)}` : '尚未建立索引';
    }
    $('refresh-index').disabled = Boolean(data.indexing) || state.refreshing;
    $('refresh-index').textContent = data.indexing ? '扫描中…' : '更新索引';
    $('source-path').textContent = data.source ? `读取位置：${data.source}` : '暂未找到存档位置';
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const errorsTarget = $('index-errors');
    errorsTarget.hidden = !errors.length;
    errorsTarget.replaceChildren(...errors.slice(0, 20).map((item) => node('li', '', `${item.file}：${item.error}`)));
    if (errors.length > 20) errorsTarget.append(node('li', '', `另有 ${number(errors.length - 20)} 条读取提示。`));
    const notice = $('global-notice');
    notice.hidden = !data.error && !errors.length;
    notice.textContent = data.error ? `索引提示：${data.error}` : errors.length ? `${number(errors.length)} 份存档未能完整读取，其余存档仍可搜索。详情见左下方“存档来源与索引详情”。` : '';
  }

  async function pollStatus() {
    clearTimeout(state.polling);
    try {
      const data = await request('/api/status');
      const previousVersion = state.seenIndexVersion;
      const recovered = state.statusFailure;
      state.statusFailure = false;
      state.status = data;
      renderStatus(data);
      const version = JSON.stringify([data.last_updated, data.chat_count, data.message_count]);
      const finished = !data.indexing && (state.indexWasRunning || (previousVersion !== null && previousVersion !== version));
      state.indexWasRunning = Boolean(data.indexing);
      state.seenIndexVersion = version;
      if (finished || recovered) {
        loadCharacters();
        const last = state.lastRequestedSearch;
        search(last?.snapshot || snapshotFromForm(), last?.offset || 0, true);
      }
    } catch (error) {
      state.statusFailure = true;
      $('index-status').textContent = '本地服务连接中断';
      $('index-detail').textContent = '正在自动重连';
      $('index-status').parentElement.classList.add('is-error');
      $('global-notice').hidden = false;
      $('global-notice').textContent = errorText(error);
      $('refresh-index').disabled = false;
    } finally {
      state.polling = setTimeout(pollStatus, state.status?.indexing ? 2000 : 8000);
    }
  }

  async function refreshIndex() {
    if (state.refreshing) return;
    state.refreshing = true;
    $('refresh-index').disabled = true;
    $('refresh-index').textContent = '正在开始…';
    try {
      const result = await request('/api/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Client': 'local' }, body: '{}',
      });
      state.indexWasRunning = true;
      toast(result.started ? '已开始更新索引，完成后结果会自动刷新。' : '索引正在更新，完成后结果会自动刷新。');
    } catch (error) { toast(errorText(error), true); }
    finally { state.refreshing = false; pollStatus(); }
  }

  $('search-form').addEventListener('submit', (event) => { event.preventDefault(); search(); });
  for (const id of ['character', 'role', 'include-hidden']) $(id).addEventListener('change', () => search());
  $('clear-search').addEventListener('click', () => {
    $('search-form').reset(); $('query').focus(); search();
  });
  $('query').addEventListener('search', () => { if (!$('query').value) search(); });
  $('results-prev').addEventListener('click', () => search(state.searchSnapshot, Math.max(0, state.searchOffset - PAGE_SIZE)));
  $('results-next').addEventListener('click', () => search(state.searchSnapshot, state.searchOffset + PAGE_SIZE));
  $('messages-prev').addEventListener('click', () => loadReaderPage(Math.max(0, state.readerStart - MESSAGE_PAGE_SIZE)));
  $('messages-next').addEventListener('click', () => loadReaderPage(state.readerStart + MESSAGE_PAGE_SIZE));
  $('match-prev').addEventListener('click', () => jumpToMatch(-1));
  $('match-next').addEventListener('click', () => jumpToMatch(1));
  $('copy-path').addEventListener('click', () => {
    if (state.readerData?.chat.path) copy(state.readerData.chat.path, '已复制存档完整路径');
  });
  $('back-to-results').addEventListener('click', () => {
    document.body.classList.remove('reading-open');
    const selected = [...$('results').querySelectorAll('.chat-card')].find((card) => card.dataset.chatId === state.selectedId);
    (selected?.querySelector('.chat-open') || $('query')).focus({ preventScroll: true });
  });
  $('refresh-index').addEventListener('click', refreshIndex);
  window.addEventListener('pagehide', () => { clearTimeout(state.polling); });
  pollStatus(); loadCharacters(); search();
})();
