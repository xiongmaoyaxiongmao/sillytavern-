"""Install a small loader; the implementation stays with the Tool Ball extension."""
import argparse
import json
import os
from pathlib import Path
import shutil
import time

MARKER = '// SillyTavern Tool Ball archive loader\n'


def main():
    parser = argparse.ArgumentParser(description='安装球球的手机存档搜索连接')
    parser.add_argument('sillytavern_root', type=Path, help='包含 server.js 的 SillyTavern 目录')
    args = parser.parse_args()
    root = args.sillytavern_root.expanduser().resolve()
    implementation = Path(__file__).resolve().parent / 'index.mjs'
    if not (root / 'src/plugin-loader.js').is_file():
        raise SystemExit('不是有效的 SillyTavern 目录：' + str(root))
    extension_root = root / 'public/scripts/extensions/third-party'
    if extension_root not in implementation.parents:
        raise SystemExit('请先把完整球球插件安装到该酒馆的 public/scripts/extensions/third-party 目录，再运行其中的安装脚本。')
    destination = root / 'plugins/tool-ball-archive/index.mjs'
    reference = os.path.relpath(implementation, destination.parent).replace(os.sep, '/')
    if not reference.startswith('.'):
        reference = './' + reference
    content = MARKER + 'export { info, init } from ' + json.dumps(reference) + ';\n'
    if destination.exists():
        current = destination.read_text()
        if current == content:
            print('手机搜索连接已安装。修改服务端代码后请重启酒馆。')
            return
        if not current.startswith(MARKER):
            raise SystemExit('已有同名服务端插件，未覆盖：' + str(destination))
        shutil.copy2(destination, destination.with_name('index.mjs.bak-' + str(time.time_ns())))
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(content)
    temporary.replace(destination)
    print('手机搜索连接已安装。请确认 config.yaml 中 enableServerPlugins: true，然后重启一次酒馆。')


if __name__ == '__main__':
    main()
