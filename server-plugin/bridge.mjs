import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const READ_PATHS = new Set(['/', '/index.html', '/app.js', '/style.css',
    '/api/status', '/api/characters', '/api/search', '/api/chat', '/api/matches']);
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

class BridgeError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

function sendError(response, status, message) {
    if (response.headersSent) { response.destroy(); return; }
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: message }));
}

export class ArchiveBridge {
    constructor({ launcher, port = 18765, stateDir, python = 'python3' }) {
        this.launcher = launcher;
        this.port = port;
        this.origin = `http://127.0.0.1:${port}`;
        this.stateDir = stateDir;
        this.python = python;
        this.starting = null;
        this.handle = this.handle.bind(this);
    }

    async probe() {
        let response;
        try {
            response = await fetch(`${this.origin}/api/status`, { signal: AbortSignal.timeout(2500), redirect: 'error' });
        } catch { return null; }
        let status;
        try { status = await response.json(); } catch { /* An occupied port must never be treated as our archive. */ }
        if (!response.ok || status?.app !== 'sillytavern-archive-search' || typeof status.source !== 'string') {
            throw new BridgeError(409, '存档搜索端口被其他服务占用，请在电脑上检查。');
        }
        return status;
    }

    async ensureService(source) {
        let status = await this.probe();
        if (!status) {
            if (!this.starting) {
                const args = [this.launcher, '--no-browser', '--data-root', source, '--port', String(this.port)];
                if (this.stateDir) args.push('--state-dir', this.stateDir);
                this.starting = execute(this.python, args, { timeout: 22000, maxBuffer: 8192 })
                    .catch(() => { throw new BridgeError(503, '电脑上的存档搜索未能启动。请确认 Python 3 可用，并检查存档搜索日志。'); })
                    .finally(() => { this.starting = null; });
            }
            await this.starting;
            status = await this.probe();
            if (!status) throw new BridgeError(503, '电脑上的存档搜索尚未就绪，请稍后重新连接。');
        }
        // The local service owns one index. Never expose it to another Tavern user.
        if (await realpath(status.source).catch(() => null) !== source) {
            throw new BridgeError(403, '当前索引不属于这个酒馆用户，已停止读取。请在电脑上检查存档目录。');
        }
    }

    async handle(request, response) {
        try {
            const root = request.user?.directories?.root;
            if (!request.user?.profile?.handle || typeof root !== 'string') {
                throw new BridgeError(401, '请先登录酒馆。');
            }
            if (request.headers['sec-fetch-site'] === 'cross-site') {
                throw new BridgeError(403, '请从酒馆内打开存档搜索。');
            }
            // Express removes the plugin prefix from request.url.
            const url = new URL(request.url, 'http://archive.invalid');
            const read = request.method === 'GET' && READ_PATHS.has(url.pathname);
            const refresh = request.method === 'POST' && url.pathname === '/api/refresh';
            if (!read && !refresh) throw new BridgeError(404, '存档搜索接口不存在。');
            if (refresh && request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
                throw new BridgeError(415, '更新索引请求必须使用 JSON。');
            }
            const source = await realpath(root);
            await this.ensureService(source);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60000);
            const cancel = () => { if (!response.writableEnded) controller.abort(); };
            response.once('close', cancel);
            try {
                // Only allowlisted paths and query parameters pass through. Cookies,
                // credentials and the client's Host/Origin never reach the local tool.
                const upstream = await fetch(`${this.origin}${url.pathname}${url.search}`, {
                    method: request.method, signal: controller.signal, redirect: 'error',
                    ...(refresh ? { headers: { 'Content-Type': 'application/json', 'X-Archive-Client': 'local' }, body: '{}' } : {}),
                });
                response.writeHead(upstream.status, {
                    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
                    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
                    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': POLICY,
                });
                if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response);
                else response.end();
            } finally {
                clearTimeout(timer);
                response.removeListener('close', cancel);
            }
        } catch (error) {
            if (!response.destroyed) sendError(response, error.status || 503,
                error instanceof BridgeError ? error.message : '存档搜索连接中断，请稍后重新连接。');
        }
    }
}
