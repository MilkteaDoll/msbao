// src/commands/maple.ts 
import { Context, Session, h } from 'koishi';
import { MapleStoryApi, CharacterBasicDto } from 'maplestory-openapi/tms';
import { resolve, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { Config } from '../config';
import { BindingsManager } from '../utils/bindings';
import { canUse } from '../utils/whitelist';

export function applyMapleCommands(ctx: Context, config: Config, api: MapleStoryApi, bindingsMgr: BindingsManager) {
    const isAdmin = (session: Session) => config.admins.includes(session.userId);

  // ========== 以下代码完全照搬你的原始逻辑，未做任何改动 ==========

    ctx.command('%查询 <name:string>', '查询TMS角色信息')
    .alias('%查詢')
    .action(async ({ session }, name) => {
        if (!canUse(session, config, config.ms)) return '';
        if (!name) return '请提供角色名, 用法: %查询 角色名(仅限TMS)';
        try {
        const character = await api.getCharacter(name);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';
        const basic = await api.getCharacterBasic(ocid);
        if (!basic) return '查询失败，请检查角色名';
        const encoded = encodeURIComponent(name);
        return (
            `${basic.characterName} (${basic.worldName}@${basic.characterGuildName || '无公会'})\n` +
            `${basic.characterClass} | Lv.${basic.characterLevel} (${basic.characterExpRate + '%'})\n\n` +
            `详细信息: \nhttps://maplescouter.com/info?name=${encoded}`
        );
        } catch (err: any) {
        if (err.constructor.name === 'MapleStoryApiError') {
            return `查询失败，请检查角色名(仅限TMS)`;
        }
        return `查询失败，请稍后再试或联系开发者(布丁@2482457432 )`;
        }
    });

  ctx.command('%绑定 <gameId:string>', '绑定QQ号与角色名')
    .alias('%綁定')
    .action(async ({ session }, gameId) => {
        if (!gameId) return '请提供角色名，用法: %绑定 角色名';
        const qqId = session.userId;
        const currentGameId = bindingsMgr.getBoundGameId(qqId);
        if (currentGameId) {
        return `${qqId} 已与 ${currentGameId} 绑定，如需换绑，先使用"%解绑"后再次绑定。`;
        }
        bindingsMgr.bindQQToGameId(qqId, gameId);
        return `已成功绑定 ${qqId} 与 ${gameId}`;
    });

    ctx.command('%我的信息', '查询绑定的游戏角色信息')
    .action(async ({ session }) => {
        const qqId = session.userId;
        const boundGameId = bindingsMgr.getBoundGameId(qqId);
        if (!boundGameId) {
        return '您尚未绑定角色名，请使用 %绑定 角色名 指令进行绑定';
        }
        if (!canUse(session, config, config.ms)) return '';
        if (!config.apiKey) {
        return 'API密钥未设置，请联系管理员配置apiKey';
        }
        try {
        const character = await api.getCharacter(boundGameId);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';
        const basic = await api.getCharacterBasic(ocid);
        if (!basic) return '查询失败，请检查角色名';
        const encoded = encodeURIComponent(boundGameId);
        return (
            `${basic.characterName} (${basic.worldName}@${basic.characterGuildName || '无公会'})\n` +
            `${basic.characterClass} | Lv.${basic.characterLevel} (${basic.characterExpRate + '%'})\n\n` +
            `详细信息: \nhttps://maplescouter.com/info?name=${encoded}`
        );
        } catch (err: any) {
        if (err.constructor.name === 'MapleStoryApiError') {
            return `查询失败，请检查角色名(仅限TMS)`;
        }
        return `查询失败，请稍后再试或联系开发者(布丁@2482457432 )`;
        }
    });

    ctx.command('%我的经验', '查看绑定角色最近7天经验变化')
    .alias('%我的經驗')
    .action(async ({ session }) => {
        const qqId = session.userId;
        const boundGameId = bindingsMgr.getBoundGameId(qqId);
        if (!boundGameId) {
        return '你尚未绑定角色名，使用 %绑定 角色名 指令进行绑定';
        }
        if (!canUse(session, config, config.ms)) return '';
        if (!config.apiKey) {
        return 'API密钥未设置，请联系管理员配置apiKey';
        }
        try {
        const character = await api.getCharacter(boundGameId);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';

        const tst = new Date(Date.now() + 8 * 3600_000);
        function getTstDate(offsetDay: number) {
          const d = new Date(tst.getTime() + offsetDay * 86400_000);
            d.setHours(0, 0, 0, 0);
            return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        }
        const dates: ({ year: number; month: number; day: number } | null)[] = [null];
        for (let i = 1; i <= 7; i++) dates.push(getTstDate(-i));

        const basics: (CharacterBasicDto | null)[] = [];
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            try {
            await new Promise(r => setTimeout(r, config.ms.queryInterval ?? 100));
            const b = date === null
                ? await api.getCharacterBasic(ocid)
                : await api.getCharacterBasic(ocid, date);
            basics.push(b);
            } catch (e) {
            basics.push(null);
            }
        }

        const valid = basics.filter((b) => b) as CharacterBasicDto[];
        if (valid.length < 2) return '网络错误（';

        const dailyDiffs: number[] = [];
        for (let i = 0; i < valid.length - 1; i++) {
            const curr = valid[i];
            const prev = valid[i + 1];
            if (curr.characterLevel === prev.characterLevel) {
            dailyDiffs.push(Number(curr.characterExpRate) - Number(prev.characterExpRate));
            }
        }
        const avgDiff = dailyDiffs.length ? dailyDiffs.reduce((a, b) => a + b, 0) / dailyDiffs.length : 0;
        const currentRate = Number(valid[0].characterExpRate);
        const gap = 100 - currentRate;
        const predictDays = avgDiff <= 0 ? '∞' : Math.max(1, Math.ceil(gap / avgDiff)).toString();
        const upgradeDate = new Date(Date.now() + parseInt(predictDays) * 86400_000);
        const upgradeStr = `${upgradeDate.getFullYear()}-${String(upgradeDate.getMonth() + 1).padStart(2, '0')}-${String(upgradeDate.getDate()).padStart(2, '0')}`;

        const head = valid[0];
        let lines =
            `${head.characterName}·${head.characterClass} (${head.worldName}@${head.characterGuildName || '无公会'})\n` +
            '经验变化:\n';

        for (let i = 0; i < valid.length - 1; i++) {
            const curr = valid[i];
            const prev = valid[i + 1];
            if (curr.characterLevel > prev.characterLevel) {
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)\n`;
            } else {
            const diff = (Number(curr.characterExpRate) - Number(prev.characterExpRate)).toFixed(3);
            const sign = diff.startsWith('-') ? '' : '+';
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)[${sign}${diff}%]\n`;
            }
        }
        lines += `----------------------\n日均+${avgDiff.toFixed(3)}%/天\n预计升级还需: ${predictDays} 天\n预计升级日期: ${upgradeStr}\n\n(如若升级则不计算日均增长,可能出现预计数据报错)\n(当日数据可能不准确,下午6点完成更新)`;

        const candidates = config.ms.images?.map(s => s.trim()).filter(Boolean) || [];
        const existFiles = candidates
            .map(f => resolve(process.cwd(), f))
            .filter(f => existsSync(f));

        if (existFiles.length) {
          const picked = existFiles[Math.floor(Math.random() * existFiles.length)];
            return [
            lines.trimEnd(),
            h.image(pathToFileURL(picked).href)
            ];
        }
        return lines.trimEnd();
        } catch (err: any) {
        if (err.constructor.name === 'MapleStoryApiError') return '查询失败，请检查角色名(仅限TMS)';
        return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )';
        }
    });

    ctx.command('%查岗 <name:string>', '查看角色最近7天经验变化')
    .alias('%查崗')
    .action(async ({ session }, name) => {
        if (!canUse(session, config, config.ms)) return '';
        if (!name) return '请提供角色名';
        if (!config.apiKey) {
        return 'API密钥未设置，请联系管理员配置apiKey';
        }
        try {
        const character = await api.getCharacter(name);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';

        const tst = new Date(Date.now() + 8 * 3600_000);
        function getTstDate(offsetDay: number) {
          const d = new Date(tst.getTime() + offsetDay * 86400_000);
            d.setHours(0, 0, 0, 0);
            return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        }
        const dates: ({ year: number; month: number; day: number } | null)[] = [null];
        for (let i = 1; i <= 7; i++) dates.push(getTstDate(-i));

        const basics: (CharacterBasicDto | null)[] = [];
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            try {
            await new Promise(r => setTimeout(r, config.ms.queryInterval ?? 100));
            const b = date === null
                ? await api.getCharacterBasic(ocid)
                : await api.getCharacterBasic(ocid, date);
            basics.push(b);
            } catch (e) {
            basics.push(null);
            }
        }

        const valid = basics.filter((b) => b) as CharacterBasicDto[];
        if (valid.length < 2) return '网络错误（';

        const dailyDiffs: number[] = [];
        for (let i = 0; i < valid.length - 1; i++) {
            const curr = valid[i];
            const prev = valid[i + 1];
            if (curr.characterLevel === prev.characterLevel) {
            dailyDiffs.push(Number(curr.characterExpRate) - Number(prev.characterExpRate));
            }
        }
        const avgDiff = dailyDiffs.length ? dailyDiffs.reduce((a, b) => a + b, 0) / dailyDiffs.length : 0;
        const currentRate = Number(valid[0].characterExpRate);
        const gap = 100 - currentRate;
        const predictDays = avgDiff <= 0 ? '∞' : Math.max(1, Math.ceil(gap / avgDiff)).toString();
        const upgradeDate = new Date(Date.now() + parseInt(predictDays) * 86400_000);
        const upgradeStr = `${upgradeDate.getFullYear()}-${String(upgradeDate.getMonth() + 1).padStart(2, '0')}-${String(upgradeDate.getDate()).padStart(2, '0')}`;

        const head = valid[0];
        let lines =
            `${head.characterName}·${head.characterClass} (${head.worldName}@${head.characterGuildName || '无公会'})\n` +
            '经验变化:\n';

        for (let i = 0; i < valid.length - 1; i++) {
            const curr = valid[i];
            const prev = valid[i + 1];
            if (curr.characterLevel > prev.characterLevel) {
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)\n`;
            } else {
            const diff = (Number(curr.characterExpRate) - Number(prev.characterExpRate)).toFixed(3);
            const sign = diff.startsWith('-') ? '' : '+';
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)[${sign}${diff}%]\n`;
            }
        }
        lines += `----------------------\n日均+${avgDiff.toFixed(3)}%/天\n预计升级还需: ${predictDays} 天\n预计升级日期: ${upgradeStr}\n\n(如若升级则不计算日均增长,可能出现预计数据报错)\n(当日数据可能不准确,下午6点完成更新)`;

        const candidates = config.ms.images?.map(s => s.trim()).filter(Boolean) || [];
        const existFiles = candidates
            .map(f => resolve(process.cwd(), f))
            .filter(f => existsSync(f));

            if (existFiles.length) {
            const picked = existFiles[Math.floor(Math.random() * existFiles.length)];
            return [
                lines.trimEnd(),
                h.image(pathToFileURL(picked).href)
            ];
            }
            return lines.trimEnd();
        } catch (err: any) {
            if (err.constructor.name === 'MapleStoryApiError') return '查询失败，请检查角色名(仅限TMS)';
            return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )';
        }
        });

    ctx.command('%解绑', '解绑QQ号与角色名的绑定')
        .alias('%解綁')
        .action(async ({ session }) => {
        const qqId = session.userId;
        const boundGameId = bindingsMgr.getBoundGameId(qqId);
        if (!boundGameId) {
            return '你尚未绑定角色名，无需解绑';
        }
        bindingsMgr.unbindQQ(qqId);
        return `成功解绑 ${qqId} 与 ${boundGameId} 的关联`;
        });

  // ========== 原始逻辑结束 ==========
}