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

//格式化日期
function formatDateToYMD(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '未知';
  
  let date: Date;
  if (typeof dateInput === 'string') {
    // 如果已经是 yyyy-MM-dd，直接返回（避免时区问题）
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    // 否则尝试解析为 Date
    date = new Date(dateInput);
  } else {
    date = dateInput;
  }

  // 检查是否有效日期
  if (isNaN(date.getTime())) {
    return '无效日期';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() 是 0-11
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

//格式化战力单位
function formatNumber(numStr: string): string {
  let num = parseInt(numStr, 10);
  if (isNaN(num) || num < 0) return numStr;

  let parts: string[] = [];

  if (num >= 100_000_000) {
    const yi = Math.floor(num / 100_000_000);
    parts.push(`${yi}亿`);
    num %= 100_000_000;
  }

  if (num >= 10_000) {
    const wan = Math.floor(num / 10_000);
    parts.push(`${wan}万`);
    num %= 10_000;
  }

  if (num > 0) {
    parts.push(num.toString());
  }

  return parts.length ? parts.join('') : '0';
}

// 🔹 新增：将 finalStat 转为键值对对象
function buildStatMap(finalStat: { statName: string; statValue: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of finalStat) {
    map[item.statName] = item.statValue;
  }
  return map;
}

// 🔹 新增：统一格式化角色信息（含基础 + 属性）
async function formatCharacterInfo(api: MapleStoryApi, ocid: string, characterName: string): Promise<string> {
  const basic = await api.getCharacterBasic(ocid);
  const stat = await api.getCharacterStat(ocid); 

  if (!basic || !stat?.finalStat) {
    throw new Error('无法获取完整角色数据');
  }

  const stats = buildStatMap(stat.finalStat);
  const createDate = formatDateToYMD(basic.characterDateCreate);
  const encoded = encodeURIComponent(characterName);

  const statLines = [
    `🌟 战斗力: ${formatNumber(stats['戰鬥力'] || '0')}`,
    `⚔️ 物攻 / 魔攻: ${stats['攻擊力'] || '0'} / ${stats['魔法攻擊力'] || '0'}`,
    // `🔮 魔攻: ${stats['魔法攻擊力'] || '0'}`,
    `🎯 最终伤害: ${stats['最終傷害'] || '0'}%`,
    `🧨 暴击伤害: ${stats['爆擊傷害'] || '0'}%`,
    `👹 BOSS伤害: ${stats['BOSS怪物傷害'] || '0'}%`,
    `👾 一般伤害: ${stats['一般怪物傷害'] || '0'}%`,
    `💥 伤害: ${stats['傷害'] || '0'}%`,
    `🛡️ 无视防御: ${stats['無視防禦率'] || '0'}%`,
    `⭐ 星力: ${stats['星力'] || '0'}`,
    `🌀 神秘力量(ARC): ${stats['神秘力量'] || '0'}`,
    `✨ 真实力量(AUT): ${stats['真實之力'] || '0'}`,
    `📦 道具掉落率: ${stats['道具掉落率'] || '0'}%`,
    `💰 枫币获得量: ${stats['楓幣獲得量'] || '0'}%`,
    `⏱️ 冷卻减少(秒): ${stats['冷卻時間減少(秒)'] || '0'}秒`,
  ].join('\n');

  return (
    `${basic.characterName} (${basic.worldName}@${basic.characterGuildName || '无公会'})\n` +
    `${basic.characterClass} | Lv.${basic.characterLevel} (${basic.characterExpRate}%)\n` +
    `\n建立日期: ${createDate}` +
    `\n\n详细属性:\n${statLines}\n\n` +
    `更多详细信息: \nhttps://maplescouter.com/info?name=${encoded}`
  );
}

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
      if (!name) return '请提供角色名, 用法: %查询 角色名';
      try {
        const character = await api.getCharacter(name);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';
        return await formatCharacterInfo(api, ocid, name);
      } catch (err: any) {
        if (err.constructor.name === 'MapleStoryApiError') {
          return `查询失败，请检查角色名`;
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
        return `你的QQ号${qqId} 已与ID ${currentGameId} 绑定，如需换绑，先使用"%解绑"后再次绑定。`;
      }
      bindQQToGameId(qqId, gameId);
      return `已成功将你的QQ号 ${qqId} 与ID ${gameId} 绑定`;
    });

  ctx.command('%我的信息', '查询绑定的游戏角色信息')
    .action(async ({ session }) => {
      const qqId = session.userId;
      const boundGameId = getBoundGameId(qqId);
      if (!boundGameId) {
        return '你尚未绑定角色名，快使用 %绑定 角色名 指令进行绑定吧';
      }
      if (!canUse(session, config.ms)) return '';
      if (!config.apiKey) {
        return 'API密钥未设置，请联系开发者配置API密钥';
      }
      try {
        const character = await api.getCharacter(boundGameId);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';
        return await formatCharacterInfo(api, ocid, boundGameId);
      } catch (err: any) {
        if (err.constructor.name === 'MapleStoryApiError') {
          return `查询失败，请检查角色名`;
        }
        return `查询失败，请稍后再试或联系开发者(布丁@2482457432 )`;
      }
    });

  // 🔴【新增】统一的经验趋势分析函数（参考 ExpTrendChart.tsx）
  async function analyzeExpTrend(api: MapleStoryApi, ocid: string, queryInterval: number): Promise<string> {
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
        await new Promise(r => setTimeout(r, queryInterval));
        const b = date === null
          ? await api.getCharacterBasic(ocid)
          : await api.getCharacterBasic(ocid, date);
        basics.push(b);
      } catch (e) {
        basics.push(null);
      }
    }

    const valid = basics.filter((b) => b) as CharacterBasicDto[];
    if (valid.length < 2) throw new Error('网络错误（');

    // 构建每日变化记录（含升级情况）
    const records: { level: number; expRate: number; label: string; gain?: number }[] = [];
    for (let i = 0; i < valid.length; i++) {
      records.push({
        level: valid[i].characterLevel,
        expRate: Number(valid[i].characterExpRate),
        label: i === 0 ? '目  前' : `${i}天前`,
      });
    }

    // 计算每日经验增益（含升级）
    const gains: number[] = [];
    for (let i = 0; i < records.length - 1; i++) {
      const curr = records[i];
      const prev = records[i + 1];
      let gain = 0;

      if (curr.level > prev.level) {
        // 升级：(100 - 前日%) + 当日% + (等级差 - 1) * 100
        const levelDiff = curr.level - prev.level;
        gain = (100 - prev.expRate) + curr.expRate + (levelDiff - 1) * 100;
      } else if (curr.level === prev.level) {
        gain = curr.expRate - prev.expRate;
      } else {
        // 掉级？跳过
        continue;
      }
      gains.push(gain);
      records[i].gain = gain;
    }

    // 计算七日总成长（用于标题）
    const start = records[records.length - 1];
    const end = records[0];
    let totalGrowthStr = '';
    if (end.level > start.level) {
      totalGrowthStr = `+${end.level - start.level} Lv`;
    } else {
      const totalGain = end.expRate - start.expRate;
      totalGrowthStr = `${totalGain >= 0 ? '+' : ''}${totalGain.toFixed(3)}%`;
    }

    // 日均增长（只考虑有 gain 的天数）
    const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
    const currentRate = end.expRate;
    const gap = 100 - currentRate;
    const predictDays = avgGain <= 0 ? '∞' : Math.max(1, Math.ceil(gap / avgGain)).toString();
    const upgradeDate = new Date(Date.now() + parseInt(predictDays) * 86400_000);
    const upgradeStr = `${upgradeDate.getFullYear()}-${String(upgradeDate.getMonth() + 1).padStart(2, '0')}-${String(upgradeDate.getDate()).padStart(2, '0')}`;

    // 构建输出文本
    let lines =
      `${valid[0].characterName}·${valid[0].characterClass} (${valid[0].worldName}@${valid[0].characterGuildName || '无公会'})\n` +
      '\n经验变化:\n';

    for (let i = 0; i < records.length - 1; i++) {
      const curr = records[i];
      const gain = curr.gain;
      if (gain !== undefined) {
        const sign = gain >= 0 ? '+' : '';
        lines += `${curr.label}: Lv.${curr.level} (${curr.expRate.toFixed(3)}%) [${sign}${gain.toFixed(3)}%]\n`;
      } else {
        lines += `${curr.label}: Lv.${curr.level} (${curr.expRate.toFixed(3)}%)\n`;
      }
    }

    lines += `------------------------------\n近期成长: ${totalGrowthStr}\n日均+${avgGain.toFixed(3)}% /天\n预计升级还需: ${predictDays} 天\n预计升级日期: ${upgradeStr}\n\n(当日数据可能不准确,下午6点完成数据分割)`;

    return lines.trimEnd();
  }

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
        return 'API密钥未设置，请联系开发者配置API密钥';
      }
      try {
        const character = await api.getCharacter(boundGameId);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';

        const resultText = await analyzeExpTrend(api, ocid, config.ms.queryInterval ?? 100);

        const candidates = config.ms.images?.map(s => s.trim()).filter(Boolean) || [];
        const existFiles = candidates
          .map(f => resolve(process.cwd(), f))
          .filter(f => existsSync(f));

        if (existFiles.length) {
          const picked = existFiles[Math.floor(Math.random() * existFiles.length)];
          return [
            resultText,
            h.image(pathToFileURL(picked).href)
          ];
        }
        return resultText;
      } catch (err: any) {
        if (err.message === '网络错误（') return '网络错误（';
        if (err.constructor.name === 'MapleStoryApiError') return '查询失败，请检查角色名';
        return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )';
      }
    });

  ctx.command('%查岗 <name:string>', '查看角色最近7天经验变化')
    .alias('%查崗')
    .action(async ({ session }, name) => {
      if (!canUse(session, config.ms)) return '';
      if (!name) return '请提供角色名';
      if (!config.apiKey) {
        return 'API密钥未设置，请联系开发者配置API密钥';
      }
      try {
        const character = await api.getCharacter(name);
        const ocid = character.ocid;
        if (!ocid) return '查询失败，请检查角色名';

        const resultText = await analyzeExpTrend(api, ocid, config.ms.queryInterval ?? 100);

        const candidates = config.ms.images?.map(s => s.trim()).filter(Boolean) || [];
        const existFiles = candidates
          .map(f => resolve(process.cwd(), f))
          .filter(f => existsSync(f));

        if (existFiles.length) {
          const picked = existFiles[Math.floor(Math.random() * existFiles.length)];
          return [
            resultText,
            h.image(pathToFileURL(picked).href)
          ];
        }
        return resultText;
      } catch (err: any) {
        if (err.message === '网络错误（') return '网络错误（';
        if (err.constructor.name === 'MapleStoryApiError') return '查询失败，请检查角色名';
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