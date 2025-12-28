import { Context, Schema, Session, Command, h } from 'koishi';
import { MapleStoryApi } from 'maplestory-openapi/tms';
import { CharacterBasicDto } from 'maplestory-openapi/tms';
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

export interface Config {
  enabled: boolean;
  whitelistMode: boolean;
  whitelist: string[];
  admins: string[];

  apiKey: string;
  ms: {
    useGlobalwlist: boolean;
    selfWhitelist: string[];
    queryInterval?: number;
    images?: string[];
    dataPath?: string; // 👈 现在明确表示“目录路径”
  };

  URL: {
    enabled: boolean;
    Lists: Array<{
      name: string;
      websites: string[];
      useGlobalwlist: boolean;
      selfWhitelist: string[];
    }>;
  };

  Key: {
    enabled: boolean;
    keywords: Array<{
      listening: string;
      reply: string;
      useGlobalwlist: boolean;
      selfWhitelist: string[];
    }>;
  };
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().description('插件开关').default(true),
  whitelistMode: Schema.boolean().description('是否开启白名单模式（开启后仅白名单群生效）').default(true),
  whitelist: Schema.array(Schema.string().description('白名单群号')).role('table').default([]),
  admins: Schema.array(Schema.string().description('管理员QQ号')).role('table').default([]),

  URL: Schema.object({
    enabled: Schema.boolean().description('查询功能开关').default(true),
    Lists: Schema.array(
      Schema.object({
        name: Schema.string().description('触发指令'),
        websites: Schema.array(Schema.string().description('网址')).role('table'),
        useGlobalwlist: Schema.boolean().default(true).description('是否套用全局白名单'),
        selfWhitelist: Schema.array(Schema.string()).role('table').default([]).description('独立白名单'),
      })
    ).description('查询指令列表'),
  }),

  Key: Schema.object({
    enabled: Schema.boolean().description('关键词回复功能开关').default(false),
    keywords: Schema.array(
      Schema.object({
        listening: Schema.string().description('监听词'),
        reply: Schema.string().description('回复语句'),
        useGlobalwlist: Schema.boolean().default(false).description('是否套用全局白名单'),
        selfWhitelist: Schema.array(Schema.string()).role('table').default([]).description('独立白名单'),
      })
    ).description('关键词与回复语句映射表'),
  }),

  apiKey: Schema.string().description('Nexon-API 密钥').default(''),
  ms: Schema.object({
    useGlobalwlist: Schema.boolean().default(true).description('是否套用全局白名单'),
    selfWhitelist: Schema.array(Schema.string()).role('table').default([]).description('独立白名单'),
    queryInterval: Schema.number().default(100).description('查询间隔（毫秒）'),
    images: Schema.array(Schema.string()).role('table').default(['image.png']).description('随消息一起发出的图片文件名（放在插件根目录，可带子目录）'),
    
    // 🔴【重要改动 1】：明确 dataPath 是“目录路径”，使用 role('folder')
    dataPath: Schema.string()
      .description('数据存储目录（留空则使用默认目录）')
      .default('')
      .role('folder'), // 👈 Koishi Web 控制台会显示为“选择文件夹”
  }),
});

export const name = 'msbao';

// 插件入口
export function apply(ctx: Context, config: Config) {
  if (!config.enabled) return;

  const isAdmin = (session: Session) => config.admins.includes(session.userId);

  // 🔴【重要改动 2】：重构数据路径逻辑 —— 明确分离“目录”和“文件名”
  const DATA_DIR = resolve(
    config.ms.dataPath?.trim()
      ? config.ms.dataPath.trim()                 // 用户提供目录
      : resolve(process.cwd(), 'data', 'msbao')   // 默认目录
  );
  const BINDINGS_FILE = resolve(DATA_DIR, 'bindings.json'); // 👈 固定文件名

  // 确保目录存在（递归创建）
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  // 初始化绑定数据
  let bindings: { [qqId: string]: string } = {};
  if (existsSync(BINDINGS_FILE)) {
    try {
      bindings = JSON.parse(readFileSync(BINDINGS_FILE, 'utf-8'));
    } catch (e) {
      console.error('读取绑定数据失败，使用空数据:', e);
      bindings = {};
    }
  }

  // 🔴【重要改动 3】：保存时写入明确的 JSON 文件路径
  const saveBindings = () => {
    // 可选：加日志便于调试（上线可注释）
    // console.log('[msbao] Saving bindings to:', BINDINGS_FILE);
    writeFileSync(BINDINGS_FILE, JSON.stringify(bindings, null, 2), 'utf-8');
  };

  const getBoundGameId = (qqId: string): string | null => {
    return bindings[qqId] || null;
  };

  const bindQQToGameId = (qqId: string, gameId: string): void => {
    bindings[qqId] = gameId;
    saveBindings();
  };

  const unbindQQ = (qqId: string): void => {
    if (bindings.hasOwnProperty(qqId)) {
      delete bindings[qqId];
      saveBindings();
    }
  };

  // 白名单判断逻辑（保持不变）
  function canUse(session: Session, item: { useGlobalwlist?: boolean; selfWhitelist?: string[] }): boolean {
    if (!session.guildId) return true;
    if (item.useGlobalwlist !== false) {
      return !config.whitelistMode || config.whitelist.includes(session.channelId);
    }
    const self = item.selfWhitelist || [];
    if (self.length === 0) return true;
    return self.includes(session.channelId);
  }

  // ========== 其余功能逻辑保持不变 ==========
  // （网站查询、关键词监听、管理指令、%查询、%绑定、%我的信息、%我的经验、%查岗、%解绑）

  if (config.URL.enabled) {
    for (const cmd of config.URL.Lists) {
      const commandName = cmd.name.trim();
      if (!commandName) continue;
      ctx.command(commandName, `TBD`).action(({ session }) => {
        if (!canUse(session, cmd)) return;
        if (!cmd.websites?.length) return '暂无或忘了（';
        return cmd.websites.join('\n');
      });
    }
  }

  if (config.Key.enabled) {
    ctx.on('message', async (session: Session) => {
      for (const kw of config.Key.keywords) {
        if (!canUse(session, kw)) continue;
        if (new RegExp(kw.listening, 'i').test(session.content)) {
          await session.send(kw.reply);
          break;
        }
      }
    });
  }

  ctx.command('listweb').action(async ({ session }) => {
    if (!isAdmin(session)) return '';
    if (!config.URL.Lists.length) return '暂无或忘了（';
    return '=== 指令 ===\n' + config.URL.Lists.map(i => `【${i.name}】\n${i.websites.join('\n')}`).join('\n');
  });

  ctx.command('listkey').action(async ({ session }) => {
    if (!isAdmin(session)) return '';
    if (!config.Key.keywords.length) return 'None';
    return '=== 监听 ===\n' + config.Key.keywords.map(k => `监听：${k.listening} → 回复：${k.reply}`).join('\n');
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

  const api = new MapleStoryApi(config.apiKey);

  ctx.command('%查询 <name:string>', '查询TMS角色信息')
    .alias('%查詢')
    .action(async ({ session }, name) => {
      if (!canUse(session, config.ms)) return '';
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
      const currentGameId = getBoundGameId(qqId);
      if (currentGameId) {
        return `${qqId} 已与 ${currentGameId} 绑定，如需换绑，先使用"%解绑"后再次绑定。`;
      }
      bindQQToGameId(qqId, gameId);
      return `已成功绑定 ${qqId} 与 ${gameId}`;
    });

  ctx.command('%我的信息', '查询绑定的游戏角色信息')
    .action(async ({ session }) => {
      const qqId = session.userId;
      const boundGameId = getBoundGameId(qqId);
      if (!boundGameId) {
        return '您尚未绑定角色名，请使用 %绑定 角色名 指令进行绑定';
      }
      if (!canUse(session, config.ms)) return '';
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
      const boundGameId = getBoundGameId(qqId);
      if (!boundGameId) {
        return '你尚未绑定角色名，使用 %绑定 角色名 指令进行绑定';
      }
      if (!canUse(session, config.ms)) return '';
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
      if (!canUse(session, config.ms)) return '';
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
      const boundGameId = getBoundGameId(qqId);
      if (!boundGameId) {
        return '你尚未绑定角色名，无需解绑';
      }
      unbindQQ(qqId);
      return `成功解绑 ${qqId} 与 ${boundGameId} 的关联`;
    });
}