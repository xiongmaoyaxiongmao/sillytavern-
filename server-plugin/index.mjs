import { fileURLToPath } from 'node:url';
import { ArchiveBridge } from './bridge.mjs';

export const info = {
    id: 'tool-ball-archive',
    name: 'Tool Ball Archive Search',
    description: 'Use the Tavern address and access controls for local archive search.',
};

export async function init(router) {
    const launcher = fileURLToPath(new URL('../outputs/chat-archive-search/launch.py', import.meta.url));
    const bridge = new ArchiveBridge({ launcher });
    router.use(bridge.handle);
}
