"""End-to-end checks use isolated sample archives, never live SillyTavern data."""
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent


class ArchiveFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        cls.source = cls.root / 'source'
        cls.a = cls.source / 'chats/角色甲/春天.jsonl'
        cls.b = cls.source / 'chats/角色乙/夏天.jsonl'
        cls.g = cls.source / 'group chats/group-1.jsonl'
        cls.rows_a = [
            {'chat_metadata': {'private': '只在记忆中的秘密'}, 'character_name': '角色甲'},
            {'name': '你', 'is_user': True, 'mes': '今晚去海边散步 <b>看星星</b>', 'send_date': '2026-01-01'},
            {'name': '甲', 'mes': '月光下的海边 Alpha %_ literal', 'swipes': ['旧候选专属文字'], 'swipe_id': 0},
            {'name': '甲', 'mes': '<script>脚本专属词</script><p>咖啡 与 海边</p>'},
            {'name': '甲', 'mes': '隐藏海边', 'extra': {'is_hidden': True}},
            {'name': '系统', 'is_system': True, 'mes': '系统海边'},
        ]
        cls.write(cls.a, cls.rows_a)
        cls.write(cls.b, [
            {'chat_metadata': {}},
            {'name': '乙', 'mes': '独特短句'},
            {'name': '你', 'is_user': True, 'mes': '咖啡'},
            {'name': '乙', 'mes': '海边'},
        ])
        cls.write(cls.g, [{'name': '群成员', 'mes': '群聊第一条也要搜索到'}])
        cls.before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in cls.source.rglob('*.jsonl')}
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.url = f'http://127.0.0.1:{port}'
        cls.log = (cls.root / 'server.log').open('wb')
        cls.process = subprocess.Popen(
            [sys.executable, str(BASE / 'server.py'), '--data-root', str(cls.source),
             '--state-dir', str(cls.root / 'state'), '--port', str(port)],
            stdout=cls.log, stderr=cls.log,
        )
        try:
            cls.wait_ready()
        except Exception:
            cls.process.terminate()
            cls.process.wait(timeout=5)
            cls.log.close()
            print((cls.root / 'server.log').read_text())
            raise

    @staticmethod
    def write(path, rows):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('\n'.join(json.dumps(row, ensure_ascii=False) for row in rows) + '\n', encoding='utf-8')

    @classmethod
    def api(cls, path, **params):
        if params:
            path += '?' + urlencode(params)
        with urlopen(cls.url + path, timeout=10) as response:
            return json.load(response)

    @classmethod
    def wait_ready(cls):
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                raise AssertionError('Server stopped unexpectedly')
            try:
                data = cls.api('/api/status')
                if not data['indexing']:
                    return data
            except (URLError, ConnectionError):
                pass
            time.sleep(.05)
        raise AssertionError('Index did not finish')

    @classmethod
    def refresh(cls):
        req = Request(cls.url + '/api/refresh', data=b'{}', headers={
            'Content-Type': 'application/json', 'X-Archive-Client': 'local',
        })
        with urlopen(req, timeout=10) as response:
            json.load(response)
        return cls.wait_ready()

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.log.close()
        cls.tmp.cleanup()

    def test_01_browse_counts_and_source_unchanged(self):
        s = self.api('/api/status')
        self.assertEqual(s['app'], 'sillytavern-archive-search')
        self.assertEqual(s['chat_count'], 3)
        self.assertEqual(s['message_count'], 9)
        r = self.api('/api/search')
        self.assertEqual(r['total_chats'], 3)
        after = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in self.source.rglob('*.jsonl')}
        self.assertEqual(self.before, after)

    def test_02_one_two_and_three_character_search(self):
        for query in ['海', '海边', '看星星']:
            with self.subTest(query=query):
                self.assertGreater(self.api('/api/search', q=query)['total_matches'], 0)

    def test_03_literal_case_and_multiple_terms(self):
        self.assertEqual(self.api('/api/search', q='ALPHA')['total_matches'], 1)
        self.assertEqual(self.api('/api/search', q='%_')['total_matches'], 1)
        r = self.api('/api/search', q='咖啡   海边')
        self.assertEqual(r['total_matches'], 1)
        self.assertEqual(r['total_chats'], 1)

    def test_04_metadata_and_other_swipes_excluded(self):
        for query in ['只在记忆中的秘密', '旧候选专属文字', '脚本专属词']:
            self.assertEqual(self.api('/api/search', q=query)['total_matches'], 0)

    def test_05_roles_hidden_and_character_filters(self):
        self.assertEqual(self.api('/api/search', q='海边')['total_matches'], 4)
        self.assertEqual(self.api('/api/search', q='海边', include_hidden=1)['total_matches'], 6)
        self.assertEqual(self.api('/api/search', q='海边', role='user')['total_matches'], 1)
        self.assertEqual(self.api('/api/search', q='海边', character='角色甲')['total_matches'], 3)
        self.assertEqual(self.api('/api/search', q='海边', role='system', include_hidden=1)['total_matches'], 1)

    def test_06_group_first_message_kept(self):
        r = self.api('/api/search', q='群聊第一条')
        self.assertEqual(r['total_matches'], 1)
        self.assertEqual(r['chats'][0]['snippets'][0]['number'], 0)

    def test_07_context_and_pagination(self):
        r = self.api('/api/search', q='ALPHA')
        chat = r['chats'][0]
        number = chat['snippets'][0]['number']
        self.assertEqual(number, 1)
        page = self.api('/api/chat', id=chat['id'], start=0, limit=2)
        self.assertEqual([m['number'] for m in page['messages']], [0, 1])
        self.assertEqual(page['total'], 5)
        self.assertTrue(page['has_more'])
        self.assertEqual(self.api('/api/matches', id=chat['id'], q='海边')['numbers'], [0, 1, 2])
        self.assertIn('看星星', page['messages'][0]['text'])
        self.assertNotIn('<b>', page['messages'][0]['text'])
        paged = self.api('/api/search', limit=1, offset=1)
        self.assertEqual(len(paged['chats']), 1)
        self.assertEqual(paged['total_chats'], 3)

    def test_08_local_access_boundary(self):
        for headers in [{'Host': 'evil.example'}, {'Origin': 'https://evil.example'}]:
            req = Request(self.url + '/api/status', headers=headers)
            with self.assertRaises(HTTPError) as error:
                urlopen(req, timeout=3)
            self.assertIn(error.exception.code, [400, 403])
        req = Request(self.url + '/api/refresh', data=b'{}', headers={'Content-Type': 'text/plain'})
        with self.assertRaises(HTTPError) as error:
            urlopen(req, timeout=3)
        self.assertIn(error.exception.code, [400, 403, 415])

    def test_09_incremental_update_failure_preservation_and_delete(self):
        # Only fixture files are changed; no production data is used in this suite.
        self.write(self.a, self.rows_a + [{'name': '甲', 'mes': '增量新增标记'}])
        self.refresh()
        self.assertEqual(self.api('/api/search', q='增量新增标记')['total_matches'], 1)
        with self.a.open('a') as stream:
            stream.write('{broken json\n')
        s = self.refresh()
        self.assertTrue(s['errors'])
        self.assertEqual(self.api('/api/search', q='增量新增标记')['total_matches'], 1)
        self.write(self.a, self.rows_a)
        self.b.unlink()
        self.refresh()
        self.assertEqual(self.api('/api/status')['chat_count'], 2)
        self.assertEqual(self.api('/api/search', q='增量新增标记')['total_matches'], 0)
        renamed = self.root / 'source-temporarily-offline'
        self.source.rename(renamed)
        try:
            s = self.refresh()
            self.assertTrue(s['error'] or s['errors'])
            self.assertEqual(s['chat_count'], 2)
        finally:
            renamed.rename(self.source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
