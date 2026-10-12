#!/usr/bin/env python3
"""Loopback-only web application for the SillyTavern archive index."""
from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from archive import Archive, DEFAULT_SOURCE, DEFAULT_STATE

STATIC = Path(__file__).resolve().parent / "static"


class Server(ThreadingHTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "ArchiveSearch/1.0"

    def log_message(self, format, *args):
        # Search terms and private chat IDs should not enter console logs.
        pass

    def _local_request(self):
        port = self.server.server_port
        allowed = {"127.0.0.1:" + str(port), "localhost:" + str(port)}
        if port == 80:
            allowed.update({"127.0.0.1", "localhost"})
        if self.headers.get("Host", "").lower() not in allowed:
            self._json({"error": "只允许从本机地址访问"}, 403)
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin.lower() not in {"http://" + host for host in allowed}:
            self._json({"error": "不允许跨站访问"}, 403)
            return False
        if self.headers.get("Sec-Fetch-Site", "") == "cross-site":
            self._json({"error": "不允许跨站访问"}, 403)
            return False
        return True

    def _headers(self, status, content_type, length):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self._headers(status, "application/json; charset=utf-8", len(body))
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    @staticmethod
    def _integer(parameters, key, default, maximum):
        value = parameters.get(key, str(default))
        try:
            number = int(value)
        except (ValueError, TypeError) as exc:
            raise ValueError(key + " 必须是整数") from exc
        if number < 0 or number > maximum or (key == "limit" and number == 0):
            raise ValueError(key + " 超出允许范围")
        return number

    def do_GET(self):
        if not self._local_request():
            return
        url = urlsplit(self.path)
        parameters = {key: values[-1] for key, values in parse_qs(url.query, keep_blank_values=True).items()}
        archive = self.server.archive
        try:
            if url.path == "/api/status":
                self._json(archive.status())
            elif url.path == "/api/characters":
                self._json(archive.characters())
            elif url.path == "/api/search":
                query = parameters.get("q", "")
                if len(query) > 1000:
                    raise ValueError("关键词过长，请缩短后重试")
                self._json(archive.search(query, parameters.get("character", ""), parameters.get("role", ""),
                    parameters.get("include_hidden") == "1", self._integer(parameters, "offset", 0, 100000000), self._integer(parameters, "limit", 30, 100)))
            elif url.path == "/api/chat":
                self._json(archive.chat(parameters.get("id", ""), self._integer(parameters, "start", 0, 100000000), self._integer(parameters, "limit", 80, 200)))
            elif url.path == "/api/matches":
                query = parameters.get("q", "")
                if len(query) > 1000:
                    raise ValueError("关键词过长，请缩短后重试")
                self._json(archive.matches(parameters.get("id", ""), query, parameters.get("role", ""), parameters.get("include_hidden") == "1"))
            elif url.path.startswith("/api/"):
                self._json({"error": "接口不存在"}, 404)
            else:
                relative = unquote(url.path).lstrip("/") or "index.html"
                # The static allowlist also prevents source and database downloads.
                if relative not in {"index.html", "app.js", "style.css"}:
                    self._json({"error": "文件不存在"}, 404)
                    return
                path = (STATIC / relative).resolve()
                if path.parent != STATIC.resolve() or not path.is_file():
                    self._json({"error": "界面文件不存在"}, 404)
                    return
                body = path.read_bytes()
                content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
                self._headers(200, content_type + "; charset=utf-8", len(body))
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass
        except KeyError as exc:
            self._json({"error": str(exc.args[0])}, 404)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)
        except Exception:
            self._json({"error": "读取索引失败，请稍后重试"}, 500)

    def do_POST(self):
        if not self._local_request():
            return
        if urlsplit(self.path).path != "/api/refresh":
            self._json({"error": "接口不存在"}, 404)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self._json({"error": "请求必须使用 application/json"}, 415)
            return
        if not self.headers.get("Origin") and self.headers.get("X-Archive-Client") != "local":
            self._json({"error": "缺少本机客户端标记"}, 403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 4096:
                raise ValueError()
            body = self.rfile.read(length)
            if body:
                json.loads(body)
        except (ValueError, UnicodeError):
            self._json({"error": "请求内容无效"}, 400)
            return
        self._json({"started": self.server.archive.refresh()})

    def do_OPTIONS(self):
        self._json({"error": "不允许跨站访问"}, 403)


def main():
    parser = argparse.ArgumentParser(description="本机 SillyTavern 聊天存档搜索")
    parser.add_argument("--data-root", default=str(DEFAULT_SOURCE), help="SillyTavern 用户数据目录")
    parser.add_argument("--state-dir", default=str(DEFAULT_STATE), help="独立索引保存目录")
    parser.add_argument("--port", type=int, default=18765)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port 必须在 1–65535 之间")
    archive = Archive(args.data_root, args.state_dir)
    server = Server(("127.0.0.1", args.port), Handler)
    server.archive = archive
    archive.refresh()
    print("READY http://127.0.0.1:%s" % server.server_port, flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
