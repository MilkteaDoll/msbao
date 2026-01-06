// src/commands/web.ts 
import { Context, Session } from 'koishi';
import { Config } from '../config';
import { canUse } from '../utils/whitelist';

export function applyWebCommands(ctx: Context, config: Config) {
    const isAdmin = (session: Session) => config.admins.includes(session.userId);

    if (config.URL.enabled) {
        for (const cmd of config.URL.Lists) {
        const commandName = cmd.name.trim();
        if (!commandName) continue;
        ctx.command(commandName, `TBD`).action(({ session }) => {
            if (!canUse(session, config, cmd)) return;
            if (!cmd.websites?.length) return '暂无或忘了（';
            return cmd.websites.join('\n');
        });
        }
    }

    ctx.command('listweb').action(async ({ session }) => {
        if (!isAdmin(session)) return '';
        if (!config.URL.Lists.length) return '暂无或忘了（';
        return '=== 指令 ===\n' + config.URL.Lists.map(i => `【${i.name}】\n${i.websites.join('\n')}`).join('\n');
    });

    ctx.command('listall').action(async ({ session }) => {
        if (!isAdmin(session)) return '';
        let msg = '=== 当前网页查询指令 ===\n';
        if (!config.URL.Lists.length) msg += '（暂无）\n';
        else config.URL.Lists.forEach(i => { msg += `【${i.name}】\n${i.websites.join('\n')}\n`; });
        msg += '\n=== 当前关键词监听 ===\n';
        if (!config.Key.keywords.length) msg += '（暂无）\n';
        else config.Key.keywords.forEach(k => { msg += `监听：${k.listening} → 回复：${k.reply}\n`; });
        return msg.trimEnd();
    });
}