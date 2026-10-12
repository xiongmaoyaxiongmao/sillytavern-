"""Read-only SillyTavern chat indexing and search, using only Python's stdlib."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading
import time
import unicodedata
from contextlib import closing
from html.parser import HTMLParser
from pathlib import Path

DEFAULT_SOURCE = Path.home() / "SillyTavern-Launcher/SillyTavern/data/default-user"
DEFAULT_STATE = Path.home() / "Library/Application Support/SillyTavern Archive Search"
GRAM_SEPARATOR = "\ue000"


def short_grams(text):
    return GRAM_SEPARATOR + GRAM_SEPARATOR.join(text) + GRAM_SEPARATOR


class ArchiveError(Exception):
    pass


class _TextParser(HTMLParser):
    BREAKS = {"br", "p", "div", "li", "ul", "ol", "blockquote", "pre", "tr", "h1", "h2", "h3", "h4", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.suppressed = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.suppressed.append(tag)
        elif not self.suppressed and tag in self.BREAKS:
            self.parts.append("\n")

    def handle_startendtag(self, tag, attrs):
        if not self.suppressed and tag in self.BREAKS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if self.suppressed:
            if tag == self.suppressed[-1]:
                self.suppressed.pop()
        elif tag in self.BREAKS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.suppressed:
            self.parts.append(data)


def plain_text(value):
    if not isinstance(value, str):
        return ""
    parser = _TextParser()
    parser.feed(value)
    parser.close()
    return re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", "".join(parser.parts)).strip()


def normalize(value):
    return unicodedata.normalize("NFKC", str(value)).lower()


def keywords(query):
    return list(dict.fromkeys(normalize(query).split()))


class _JSONValidator:
    """Validate a skipped, potentially huge metadata row without retaining it."""
    NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")

    def __init__(self):
        self.stack = [["root", "value"]]
        self.token = None
        self.buffer = ""
        self.escape = False
        self.unicode_left = 0
        self.string_is_key = False

    def fail(self):
        raise ValueError("聊天头部不是有效 JSON")

    def completed(self):
        kind, state = self.stack[-1]
        if state not in {"value", "value_or_end"}:
            self.fail()
        self.stack[-1][1] = "done" if kind == "root" else "comma_or_end"

    def end_token(self):
        if self.token == "number":
            if not self.NUMBER.fullmatch(self.buffer):
                self.fail()
        elif self.token == "literal":
            if self.buffer not in {"true", "false", "null"}:
                self.fail()
        else:
            self.fail()
        self.token, self.buffer = None, ""
        self.completed()

    def feed(self, chunk):
        for char in chunk:
            if self.token == "string":
                if self.unicode_left:
                    if char not in "0123456789abcdefABCDEF":
                        self.fail()
                    self.unicode_left -= 1
                elif self.escape:
                    self.escape = False
                    if char == "u":
                        self.unicode_left = 4
                    elif char not in '\\"/bfnrt':
                        self.fail()
                elif char == "\\":
                    self.escape = True
                elif char == '"':
                    self.token = None
                    if self.string_is_key:
                        self.stack[-1][1] = "colon"
                    else:
                        self.completed()
                elif ord(char) < 32:
                    self.fail()
                continue
            if self.token:
                allowed = "0123456789.eE+-" if self.token == "number" else "abcdefghijklmnopqrstuvwxyz"
                if char in allowed:
                    self.buffer += char
                    if len(self.buffer) > 10000:
                        self.fail()
                    continue
                self.end_token()
            if char in " \r\n\t":
                continue
            kind, state = self.stack[-1]
            if state in {"key", "key_or_end"}:
                if char == '"':
                    self.token, self.string_is_key = "string", True
                elif char == "}" and state == "key_or_end":
                    self.stack.pop()
                    self.completed()
                else:
                    self.fail()
            elif state == "colon":
                if char != ":":
                    self.fail()
                self.stack[-1][1] = "value"
            elif state == "comma_or_end":
                if char == ",":
                    self.stack[-1][1] = "key" if kind == "object" else "value"
                elif char == ("}" if kind == "object" else "]"):
                    self.stack.pop()
                    self.completed()
                else:
                    self.fail()
            elif state in {"value", "value_or_end"}:
                if char == "]" and kind == "array" and state == "value_or_end":
                    self.stack.pop()
                    self.completed()
                elif char in "{[":
                    self.stack.append(["object", "key_or_end"] if char == "{" else ["array", "value_or_end"])
                elif char == '"':
                    self.token, self.string_is_key = "string", False
                elif char in "-0123456789":
                    self.token, self.buffer = "number", char
                elif char in "tfn":
                    self.token, self.buffer = "literal", char
                else:
                    self.fail()
            else:
                self.fail()

    def finish(self):
        if self.token in {"number", "literal"}:
            self.end_token()
        if self.token or self.stack != [["root", "done"]]:
            self.fail()


HEADER_START = re.compile(r'^\s*\{\s*"(?:user_name|character_name|chat_metadata|create_date)"\s*:')


def records(path):
    """Stream the first header; regular message rows use strict json.loads."""
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        first = stream.readline(65536)
        if first and HEADER_START.match(first):
            validator = _JSONValidator()
            while first:
                validator.feed(first)
                if first.endswith("\n"):
                    break
                first = stream.readline(65536)
            validator.finish()
        elif first:
            while not first.endswith("\n"):
                more = stream.readline(65536)
                if not more:
                    break
                first += more
            if first.strip():
                yield 1, json.loads(first)
        for line_number, line in enumerate(stream, 2):
            if line.strip():
                try:
                    yield line_number, json.loads(line)
                except (ValueError, TypeError) as exc:
                    raise ValueError("第 %s 行 JSON 损坏：%s" % (line_number, exc)) from exc


def bool_flag(value):
    return value is True or value == 1 or (isinstance(value, str) and value.lower() in {"true", "1"})


def parse_chat(path):
    messages = []
    for line, record in records(path):
        if not isinstance(record, dict):
            raise ValueError("第 %s 行不是消息对象" % line)
        if "mes" not in record:
            if any(key in record for key in ("chat_metadata", "user_name", "character_name")):
                continue
            raise ValueError("第 %s 行缺少 mes 正文" % line)
        if not isinstance(record["mes"], str):
            raise ValueError("第 %s 行 mes 正文不是文本" % line)
        extra = record.get("extra") if isinstance(record.get("extra"), dict) else {}
        hidden = any(bool_flag(record.get(key)) or bool_flag(extra.get(key))
                     for key in ("is_hidden", "hidden", "hide_message", "is_system"))
        role = "system" if bool_flag(record.get("is_system")) else "user" if bool_flag(record.get("is_user")) else "assistant"
        text = plain_text(record["mes"])
        date = record.get("send_date", "")
        messages.append((len(messages), str(record.get("name") or ""), role, text,
                         normalize(text), str(date) if date is not None else "", int(hidden)))
    return messages


def snippet(text, terms, size=180):
    if len(text) <= size:
        return text
    # Normalization can change length. Mapping keeps excerpts aligned with the original.
    folded, positions = [], []
    for index, char in enumerate(text):
        part = normalize(char)
        folded.append(part)
        positions.extend([index] * len(part))
    folded = "".join(folded)
    found = [folded.find(term) for term in terms]
    found = [index for index in found if index >= 0]
    anchor = positions[min(found)] if found else 0
    start = max(0, anchor - 55)
    end = min(len(text), start + size)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")


class Archive:
    def __init__(self, source=DEFAULT_SOURCE, state_dir=DEFAULT_STATE):
        self.source = Path(source).expanduser().resolve()
        self.state_dir = Path(state_dir).expanduser().resolve()
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.database = self.state_dir / "archive.sqlite3"
        self.lock = threading.Lock()
        self.progress = {"indexing": False, "processed": 0, "total": 0, "errors": [], "error": None}
        connection = self.connect()
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
                character TEXT NOT NULL, mtime REAL NOT NULL, mtime_ns INTEGER NOT NULL,
                size INTEGER NOT NULL, message_count INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                number INTEGER NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
                text TEXT NOT NULL, normalized TEXT NOT NULL, send_date TEXT NOT NULL,
                hidden INTEGER NOT NULL, UNIQUE(chat_id, number));
            CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, number);
            CREATE INDEX IF NOT EXISTS chats_character ON chats(character);
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """)
        saved_source = connection.execute("SELECT value FROM metadata WHERE key='source'").fetchone()
        if saved_source and saved_source[0] != str(self.source):
            connection.close()
            raise ArchiveError("这个索引目录已用于其他数据目录（%s）；请用 --state-dir 选择独立的索引目录" % saved_source[0])
        connection.execute("INSERT OR IGNORE INTO metadata VALUES('source',?)", (str(self.source),))
        try:
            connection.execute("CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(normalized, tokenize='trigram')")
            self.fts = True
        except sqlite3.OperationalError:
            self.fts = False
        # Boundary trigrams index one- and two-character words without storing
        # another copy of the conversation text or positions for every occurrence.
        try:
            connection.execute("CREATE VIRTUAL TABLE IF NOT EXISTS message_short_fts USING fts5(grams, tokenize='trigram', content='', contentless_delete=1, detail='none')")
            self.short_fts_available = True
        except sqlite3.OperationalError:
            self.short_fts_available = False
        ready = connection.execute("SELECT value FROM metadata WHERE key='short_fts_ready'").fetchone()
        self.short_fts = self.short_fts_available and bool(ready and ready[0] == '1')
        connection.commit()
        connection.close()
        self.database.chmod(0o600)

    def connect(self):
        connection = sqlite3.connect(str(self.database), timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def status(self):
        with self.lock:
            result = {**self.progress, "errors": list(self.progress["errors"])}
        with closing(self.connect()) as connection:
            result["chat_count"] = connection.execute("SELECT COUNT(*) FROM chats").fetchone()[0]
            result["message_count"] = connection.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
            last = connection.execute("SELECT value FROM metadata WHERE key='last_updated'").fetchone()
        result.update(app="sillytavern-archive-search", source=str(self.source), last_updated=float(last[0]) if last else None)
        return result

    def refresh(self):
        with self.lock:
            if self.progress["indexing"]:
                return False
            self.progress.update(indexing=True, processed=0, total=0, errors=[], error=None)
        threading.Thread(target=self._refresh, name="archive-indexer", daemon=True).start()
        return True

    def _scan(self):
        if not self.source.is_dir():
            raise ArchiveError("聊天数据目录不存在，已保留上次索引：" + str(self.source))
        chat_root = self.source / "chats"
        group_root = self.source / "group chats"
        if not chat_root.is_dir() and not group_root.is_dir():
            raise ArchiveError("数据目录中没有 chats 或 group chats 文件夹，已保留上次索引")
        files = []
        if chat_root.is_dir():
            for character_dir in chat_root.iterdir():
                if character_dir.is_symlink() or not character_dir.is_dir():
                    continue
                for path in character_dir.iterdir():
                    if path.suffix.lower() == ".jsonl" and path.is_file() and not path.is_symlink():
                        files.append((path, character_dir.name))
        if group_root.is_dir():
            for path in group_root.iterdir():
                if path.suffix.lower() == ".jsonl" and path.is_file() and not path.is_symlink():
                    files.append((path, "群聊"))
        return files

    def _delete_chat(self, connection, chat_id):
        if self.fts:
            connection.execute("DELETE FROM message_fts WHERE rowid IN (SELECT id FROM messages WHERE chat_id=?)", (chat_id,))
        if self.short_fts_available:
            connection.execute("DELETE FROM message_short_fts WHERE rowid IN (SELECT id FROM messages WHERE chat_id=?)", (chat_id,))
        connection.execute("DELETE FROM chats WHERE id=?", (chat_id,))

    def _refresh(self):
        connection = None
        try:
            files = self._scan()
            with self.lock:
                self.progress["total"] = len(files)
            connection = self.connect()
            if self.short_fts_available and not self.short_fts:
                with self.lock:
                    self.progress['phase'] = 'keywords'
                with connection:
                    connection.execute('DELETE FROM message_short_fts')
                    for row in connection.execute('SELECT id,normalized FROM messages'):
                        connection.execute('INSERT INTO message_short_fts(rowid,grams) VALUES(?,?)', (row['id'], short_grams(row['normalized'])))
                    connection.execute("INSERT OR REPLACE INTO metadata VALUES('short_fts_ready','1')")
                self.short_fts = True
                with self.lock:
                    self.progress['phase'] = 'files'
            previous = {row["path"]: row for row in connection.execute("SELECT * FROM chats")}
            for folder in ("chats", "group chats"):
                if any(relative.startswith(folder + "/") for relative in previous) and not (self.source / folder).is_dir():
                    raise ArchiveError(folder + " 数据目录暂时不可用，已保留上次索引")
            seen = set()
            for path, character in files:
                relative = path.relative_to(self.source).as_posix()
                seen.add(relative)
                try:
                    before = path.stat()
                    old = previous.get(relative)
                    if not old or old["mtime_ns"] != before.st_mtime_ns or old["size"] != before.st_size:
                        messages = parse_chat(path)
                        after = path.stat()
                        if (before.st_mtime_ns, before.st_size, before.st_ino) != (after.st_mtime_ns, after.st_size, after.st_ino):
                            raise ArchiveError("文件正在变化，保留上次索引，请稍后刷新")
                        chat_id = hashlib.sha256(relative.encode()).hexdigest()[:24]
                        with connection:
                            self._delete_chat(connection, chat_id)
                            connection.execute("INSERT INTO chats VALUES (?,?,?,?,?,?,?,?)", (chat_id, relative, path.stem, character,
                                after.st_mtime, after.st_mtime_ns, after.st_size, len(messages)))
                            for message in messages:
                                cursor = connection.execute("INSERT INTO messages(chat_id,number,name,role,text,normalized,send_date,hidden) VALUES(?,?,?,?,?,?,?,?)", (chat_id,) + message)
                                if self.fts:
                                    connection.execute("INSERT INTO message_fts(rowid,normalized) VALUES(?,?)", (cursor.lastrowid, message[4]))
                                if self.short_fts_available:
                                    connection.execute("INSERT INTO message_short_fts(rowid,grams) VALUES(?,?)", (cursor.lastrowid, short_grams(message[4])))
                except (OSError, UnicodeError, ValueError, sqlite3.Error, ArchiveError) as exc:
                    with self.lock:
                        self.progress["errors"].append({"file": relative, "error": str(exc)})
                finally:
                    with self.lock:
                        self.progress["processed"] += 1
            # Only a complete, successful directory scan may remove missing chats.
            # Recheck roots in case an external volume disappeared during parsing.
            if not self.source.is_dir() or not ((self.source / "chats").is_dir() or (self.source / "group chats").is_dir()):
                raise ArchiveError("扫描期间数据目录消失，已保留上次索引")
            for folder in ("chats", "group chats"):
                if any(relative.startswith(folder + "/") for relative in previous) and not (self.source / folder).is_dir():
                    raise ArchiveError(folder + " 数据目录暂时不可用，已保留上次索引")
            with connection:
                for relative, old in previous.items():
                    if relative not in seen:
                        self._delete_chat(connection, old["id"])
                connection.execute("INSERT OR REPLACE INTO metadata VALUES('last_updated',?)", (str(time.time()),))
        except Exception as exc:
            with self.lock:
                self.progress["error"] = str(exc)
        finally:
            if connection is not None:
                connection.close()
            with self.lock:
                self.progress["indexing"] = False

    def characters(self):
        with closing(self.connect()) as connection:
            rows = connection.execute("SELECT character AS name,COUNT(*) AS count FROM chats GROUP BY character ORDER BY character COLLATE NOCASE").fetchall()
        return {"characters": [dict(row) for row in rows]}

    def _conditions(self, terms, role="", include_hidden=False, character="", chat_id=""):
        conditions, values = [], []
        if not include_hidden:
            conditions.append("m.hidden=0")
        if role:
            if role not in {"user", "assistant", "system"}:
                raise ValueError("role 必须是 user、assistant 或 system")
            conditions.append("m.role=?")
            values.append(role)
        if character:
            conditions.append("c.character=?")
            values.append(character)
        if chat_id:
            conditions.append("m.chat_id=?")
            values.append(chat_id)
        # FTS only narrows candidates; instr is always the source of truth.
        long_terms = [term for term in terms if len(term) >= 3 and "\x00" not in term]
        if self.fts and long_terms:
            conditions.append("m.id IN (SELECT rowid FROM message_fts WHERE message_fts MATCH ?)")
            values.append(" AND ".join('"' + term.replace('"', '""') + '"' for term in long_terms))
        short_terms = [term for term in terms if len(term) < 3 and GRAM_SEPARATOR not in term and "\x00" not in term]
        if self.short_fts and short_terms:
            needles = [short_grams(term) if len(term) == 1 else GRAM_SEPARATOR.join(term) for term in short_terms]
            conditions.append("m.id IN (SELECT rowid FROM message_short_fts WHERE message_short_fts MATCH ?)")
            values.append(" AND ".join('"' + needle.replace('"', '""') + '"' for needle in needles))
        for term in terms:
            conditions.append("instr(m.normalized,?)>0")
            values.append(term)
        return " AND ".join(conditions) if conditions else "1", values

    def search(self, query="", character="", role="", include_hidden=False, offset=0, limit=30):
        terms = keywords(query)
        condition, values = self._conditions(terms, role, include_hidden, character)
        with closing(self.connect()) as connection:
            if terms:
                base = " FROM messages m JOIN chats c ON c.id=m.chat_id WHERE " + condition
                total_matches = connection.execute("SELECT COUNT(*)" + base, values).fetchone()[0]
                total_chats = connection.execute("SELECT COUNT(DISTINCT c.id)" + base, values).fetchone()[0]
                rows = connection.execute("SELECT c.*,COUNT(*) AS hit_count" + base + " GROUP BY c.id ORDER BY c.mtime DESC,c.id LIMIT ? OFFSET ?", values + [limit, offset]).fetchall()
            else:
                filters, args = [], []
                if character:
                    filters.append("c.character=?")
                    args.append(character)
                # With no text query, role still filters the browse results.
                if role:
                    role_condition, role_args = self._conditions([], role, include_hidden)
                    filters.append("EXISTS(SELECT 1 FROM messages m WHERE m.chat_id=c.id AND " + role_condition + ")")
                    args.extend(role_args)
                where = " WHERE " + " AND ".join(filters) if filters else ""
                total_chats = connection.execute("SELECT COUNT(*) FROM chats c" + where, args).fetchone()[0]
                total_matches = 0
                rows = connection.execute("SELECT c.*,0 AS hit_count FROM chats c" + where + " ORDER BY c.mtime DESC,c.id LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
            result = []
            for row in rows:
                item = {key: row[key] for key in ("id", "title", "character", "message_count", "mtime", "hit_count")}
                sub_condition, sub_values = self._conditions(terms, role, include_hidden, chat_id=row["id"])
                order = "ASC" if terms else "DESC"
                snippets = connection.execute("SELECT m.number,m.name,m.role,m.text,m.send_date FROM messages m JOIN chats c ON c.id=m.chat_id WHERE " + sub_condition + " ORDER BY m.number " + order + " LIMIT ?", sub_values + [3 if terms else 1]).fetchall()
                item["snippets"] = [{**dict(message), "text": snippet(message["text"], terms)} for message in snippets]
                result.append(item)
        return {"chats": result, "total_chats": total_chats, "total_matches": total_matches, "offset": offset, "limit": limit}

    def chat(self, chat_id, start=0, limit=80):
        with closing(self.connect()) as connection:
            chat = connection.execute("SELECT id,title,character,message_count,mtime,path FROM chats WHERE id=?", (chat_id,)).fetchone()
            if not chat:
                raise KeyError("找不到这份聊天存档")
            messages = connection.execute("SELECT number,name,role,text,send_date,hidden FROM messages WHERE chat_id=? AND number>=? ORDER BY number LIMIT ?", (chat_id, start, limit)).fetchall()
        total = chat["message_count"]
        return {"chat": {**dict(chat), "path": str(self.source / chat["path"])}, "messages": [{**dict(message), "hidden": bool(message["hidden"])} for message in messages],
                "start": start, "total": total, "has_more": start + len(messages) < total}

    def matches(self, chat_id, query, role="", include_hidden=False):
        terms = keywords(query)
        if not terms:
            return {"numbers": []}
        condition, values = self._conditions(terms, role, include_hidden, chat_id=chat_id)
        with closing(self.connect()) as connection:
            exists = connection.execute("SELECT 1 FROM chats WHERE id=?", (chat_id,)).fetchone()
            if not exists:
                raise KeyError("找不到这份聊天存档")
            rows = connection.execute("SELECT m.number FROM messages m JOIN chats c ON c.id=m.chat_id WHERE " + condition + " ORDER BY m.number", values).fetchall()
        return {"numbers": [row[0] for row in rows]}
