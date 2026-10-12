"""Open the local archive reader, starting its own server if necessary."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser

APP = 'sillytavern-archive-search'
BASE = Path(__file__).resolve().parent
DEFAULT_SOURCE = Path.home() / 'SillyTavern-Launcher/SillyTavern/data/default-user'
DEFAULT_STATE = Path.home() / 'Library/Application Support/SillyTavern Archive Search'


def status(url):
    try:
        with urlopen(url + '/api/status', timeout=2) as response:
            return json.load(response)
    except (URLError, ValueError, TimeoutError, OSError):
        return None


def main():
    parser = argparse.ArgumentParser(description='打开本地聊天存档搜索')
    parser.add_argument('--data-root', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--port', type=int, default=18765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    source = args.data_root.expanduser().resolve()
    state = args.state_dir.expanduser().resolve()
    if not (source / 'chats').is_dir() and not (source / 'group chats').is_dir():
        raise SystemExit('找不到聊天目录：' + str(source) + '\n请用 --data-root 指定包含 chats 的用户数据目录。')
    url = f'http://127.0.0.1:{args.port}'
    current = status(url)
    if current is not None:
        if current.get('app') != APP or current.get('source') != str(source):
            raise SystemExit(f'端口 {args.port} 已被其他工具或其他存档目录使用，请用 --port 选择其他端口。')
    else:
        state.mkdir(parents=True, exist_ok=True, mode=0o700)
        log_path = state / 'server.log'
        descriptor = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(descriptor, 'ab') as log:
            process = subprocess.Popen(
                [sys.executable, str(BASE / 'server.py'), '--data-root', str(source),
                 '--state-dir', str(state), '--port', str(args.port)],
                cwd=BASE, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True,
            )
        for _ in range(100):
            current = status(url)
            if current and current.get('app') == APP and current.get('source') == str(source):
                break
            if process.poll() is not None:
                raise SystemExit('搜索窗口启动失败。请查看日志：' + str(log_path))
            time.sleep(0.15)
        else:
            raise SystemExit('搜索窗口尚未就绪。请稍后再打开，日志：' + str(log_path))
    print('聊天搜索已就绪：' + url)
    if not args.no_browser:
        webbrowser.open(url)


if __name__ == '__main__':
    main()
