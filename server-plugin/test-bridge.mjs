import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArchiveBridge } from './bridge.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

test('archive bridge: same-origin routes preserve access boundaries', async t => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'tool-ball-bridge-'));
    const source = path.join(temporary, 'source'), other = path.join(temporary, 'other');
    await mkdir(source); await mkdir(other);
    const calls = [];
    let marker = 'sillytavern-archive-search';
    const upstream = http.createServer(async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk;
        calls.push({ url: req.url, headers: req.headers, method: req.method, body });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
        res.end(JSON.stringify(req.url === '/api/status' ? { app: marker, source } : { url: req.url, refreshed: req.method === 'POST' }));
    });
    const port = await listen(upstream);
    const bridge = new ArchiveBridge({ launcher: '/not-used', port });
    const proxy = http.createServer((req, res) => {
        if (req.headers['x-user'] !== 'anonymous') req.user = { profile: { handle: 'fixture' }, directories: { root: req.headers['x-user'] === 'other' ? other : source } };
        bridge.handle(req, res);
    });
    const address = `http://127.0.0.1:${await listen(proxy)}`;
    t.after(async () => { await close(proxy); await close(upstream); await rm(temporary, { recursive: true }); });
    await t.test('search query forwards exactly and browser credentials stay in Tavern', async () => {
        const query = '/api/search?q=' + encodeURIComponent('海边 & 咖啡') + '&offset=30';
        const r = await fetch(address + query, { headers: { Cookie: 'session=private', Authorization: 'Bearer private', Origin: address } });
        assert.equal(r.status, 200); assert.equal((await r.json()).url, query);
        const forwarded = calls.at(-1);
        assert.equal(forwarded.headers.cookie, undefined); assert.equal(forwarded.headers.authorization, undefined);
        assert.equal(forwarded.headers.origin, undefined); assert.equal(forwarded.headers.host, `127.0.0.1:${port}`);
        assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'self'/);
        assert.equal(r.headers.get('access-control-allow-origin'), null);
    });
    await t.test('no login, another data owner, cross-site or unlisted route is rejected', async () => {
        for (const [route, headers, status] of [
            ['/api/search', { 'x-user': 'anonymous' }, 401], ['/api/search', { 'x-user': 'other' }, 403],
            ['/api/chat', { 'Sec-Fetch-Site': 'cross-site' }, 403], ['/archive.sqlite3', {}, 404],
            ['/api/delete', {}, 404], ['//evil.invalid/private', {}, 404],
        ]) { const r = await fetch(address + route, { headers }); assert.equal(r.status, status); await r.text(); }
        assert.equal(calls.filter(c => c.url.startsWith('/api/search')).length, 1);
    });
    await t.test('refresh is allowlisted and sends only the internal client marker', async () => {
        let r = await fetch(address + '/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'session-private' }, body: '{}' });
        assert.equal(r.status, 200); assert.equal((await r.json()).refreshed, true);
        assert.equal(calls.at(-1).headers['x-archive-client'], 'local');
        assert.equal(calls.at(-1).headers['x-csrf-token'], undefined); assert.equal(calls.at(-1).body, '{}');
        r = await fetch(address + '/api/refresh', { method: 'POST', body: '{}' });
        assert.equal(r.status, 415); await r.text();
    });
    await t.test('an occupied port cannot substitute a different service', async () => {
        marker = 'unrelated-app'; const r = await fetch(address + '/api/chat');
        assert.equal(r.status, 409); await r.text();
        assert(!calls.some(c => c.url === '/api/chat'));
    });
});

test('first connection starts a stopped service once; failures are retryable', async t => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'tool-ball-start-'));
    const source = path.join(temporary, 'source'); await mkdir(source);
    const reservation = http.createServer(); const port = await listen(reservation); await close(reservation);
    const pidFile = path.join(temporary, 'pid'), countFile = path.join(temporary, 'starts');
    const childCode = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'sillytavern-archive-search',source:${JSON.stringify(source)}}))}).listen(${port},'127.0.0.1');`;
    const launcher = path.join(temporary, 'launch.cjs');
    await writeFile(launcher, `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(countFile)},'start\\n');const p=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{detached:true,stdio:'ignore'});p.unref();(async()=>{for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:${port}/api/status');return}catch{}await new Promise(r=>setTimeout(r,20))}process.exitCode=1})();`);
    t.after(async () => {
        const pid = await readFile(pidFile, 'utf8').catch(() => null);
        if (pid) { try { process.kill(Number(pid)); } catch {} }
        await rm(temporary, { recursive: true });
    });
    const bridge = new ArchiveBridge({ launcher, port, python: process.execPath });
    const canonicalSource = await realpath(source);
    await Promise.all(Array.from({ length: 4 }, () => bridge.ensureService(canonicalSource)));
    assert.equal((await readFile(countFile, 'utf8')).trim(), 'start');
    const failed = new ArchiveBridge({ launcher: '/missing', port: port === 65535 ? 65534 : port + 1, python: path.join(temporary, 'missing-python') });
    for (let i = 0; i < 2; i++) {
        await assert.rejects(() => failed.ensureService(canonicalSource), e => e.status === 503);
        assert.equal(failed.starting, null);
    }
});
