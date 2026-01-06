// src/commands/keyword.ts 
import { Context, Session } from 'koishi';
import { Config } from '../config';
import { canUse } from '../utils/whitelist';

export function applyKeywordListener(ctx: Context, config: Config) {
    if (!config.Key.enabled) return;

    ctx.on('message', async (session: Session) => {
        for (const kw of config.Key.keywords) {
        if (!canUse(session, config, kw)) continue;
        if (new RegExp(kw.listening, 'i').test(session.content)) {
            await session.send(kw.reply);
            break;
        }
        }
    });
}