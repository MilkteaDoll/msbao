import { Context, Schema, Session, Command, h } from 'koishi';
import { MapleStoryApi } from 'maplestory-openapi/tms';
import { CharacterBasicDto } from 'maplestory-openapi/tms'
import { pathToFileURL } from 'url'
import { resolve, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

export interface Config {
  enabled: boolean;                // 插件总开关
  whitelistMode: boolean;          // 全局白名单模式
  whitelist: string[];             // 全局白名单群
  admins: string[];                // 全局管理员 QQ（字符串数组，保持与原插件一致）

  apiKey: string;                  // 新增字段
  ms: {                            // 新增命名空间，避免顶层字段冲突
    useGlobalwlist: boolean;       // 是否走全局白名单
    selfWhitelist: string[];       // 独立白名单
    queryInterval?: number;
    images?: string[];
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

  apiKey: Schema.string().description('Nexon-API 密钥')
  .default(''),
  ms: Schema.object({
    useGlobalwlist: Schema.boolean().default(true).description('是否套用全局白名单'),
    selfWhitelist: Schema.array(Schema.string()).role('table').default([]).description('独立白名单'),
    queryInterval: Schema.number().default(100).description('查询间隔（毫秒）'),
    images: Schema.array(Schema.string()).role('table').default(['image.png']).description('随消息一起发出的图片文件名（放在插件根目录，可带子目录）') 
  }),

  
});

export const name = 'msbao';

// 插件入口
export function apply(ctx: Context, config: Config) {
  if (!config.enabled) return;

  // 通用工具函数
  const isAdmin = (session: Session) => config.admins.includes(session.userId);

  // 添加绑定信息持久化存储
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const dataDir = resolve(__dirname, '../../../data'); // 在插件目录外创建数据目录
  const dataFile = resolve(dataDir, 'bindings.json');

  // 确保数据目录存在
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // 初始化绑定数据
  let bindings: { [qqId: string]: string } = {};
  if (existsSync(dataFile)) {
    try {
      bindings = JSON.parse(readFileSync(dataFile, 'utf-8'));
    } catch (e) {
      console.error('读取绑定数据失败，使用空数据:', e);
      bindings = {};
    }
  }

  // 保存绑定数据到JSON文件
  const saveBindings = () => {
    writeFileSync(dataFile, JSON.stringify(bindings, null, 2), 'utf-8');
  };

  // 获取用户绑定的角色名
  const getBoundGameId = (qqId: string): string | null => {
    return bindings[qqId] || null;
  };

  // 绑定QQ号与角色名
  const bindQQToGameId = (qqId: string, gameId: string): void => {
    bindings[qqId] = gameId;
    saveBindings();
  };

  // 解绑QQ号与角色名
  const unbindQQ = (qqId: string): void => {
    if (bindings.hasOwnProperty(qqId)) {
      delete bindings[qqId];
      saveBindings();
    }
  };

  // 统一白名单判断（全局/独立
  function canUse(session: Session, item: { useGlobalwlist?: boolean; selfWhitelist?: string[] }): boolean {
    if (!session.guildId) return true;                       // 私聊放行
    if (item.useGlobalwlist !== false) {                     // 默认 true，走全局
      return !config.whitelistMode || config.whitelist.includes(session.channelId);
    }
    // 使用独立白名单
    const self = item.selfWhitelist || [];
    if (self.length === 0) return true;                      // 空 = 所有群
    return self.includes(session.channelId);
  }

  // 网站查询
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

  // 关键词监听
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

  // 管理指令
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

  // 实例化 API 客户端（整个生命周期复用）
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
        return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )';
      }
    });

  // 新增绑定指令
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

  // 新增"我的信息"指令
  ctx.command('%我的信息', '查询绑定的游戏角色信息')
    .action(async ({ session }) => {
      const qqId = session.userId;
      const boundGameId = getBoundGameId(qqId);
      
      if (!boundGameId) {
        return '您尚未绑定角色名，请使用 %绑定 角色名 指令进行绑定';
      }

      // 使用之前%查询的逻辑
      if (!canUse(session, config.ms)) return '';

      // 检查API密钥是否设置
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
        return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )';
      }
    });

  // 新增"我的经验"指令
  ctx.command('%我的经验', '查看绑定角色最近7天经验变化')
    .alias('%我的經驗')
    .action(async ({ session }) => {
      const qqId = session.userId;
      const boundGameId = getBoundGameId(qqId);
      
      if (!boundGameId) {
        return '你尚未绑定角色名，使用 %绑定 角色名 指令进行绑定';
      }

      // 使用之前%查岗的逻辑
      if (!canUse(session, config.ms)) return ''
      
      // 检查API密钥是否设置
      if (!config.apiKey) {
        return 'API密钥未设置，请联系管理员配置apiKey';
      }
      
      try {
        const character = await api.getCharacter(boundGameId)
        const ocid = character.ocid
        if (!ocid) return '查询失败，请检查角色名'

        /* ---- 时间判断 ---- */
        const tst = new Date(Date.now() + 8 * 3600_000)
        // if (tst.getHours() < 2) return '数据未准备好，凌晨 2 点后再查询'

        /* ---- 生成 7 个日期 ---- */
        function getTstDate(offsetDay: number) {
          const d = new Date(tst.getTime() + offsetDay * 86400_000)
          d.setHours(0, 0, 0, 0)
          return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
        }
        const dates: ({ year: number; month: number; day: number } | null)[] = [null]
        for (let i = 1; i <= 7; i++) dates.push(getTstDate(-i))

        /* ---- 逐个查 + 打印返回 ---- */
        const basics: (CharacterBasicDto | null)[] = []
        for (let i = 0; i < dates.length; i++) {
          const date = dates[i]
          const dateStr = date
            ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
            : 'latest'
          try {//
            await new Promise(r => setTimeout(r, config.ms.queryInterval ?? 100));
            const b = date === null
              ? await api.getCharacterBasic(ocid)
              : await api.getCharacterBasic(ocid, date)
            // console.log(`[dbg] 第${i}次  date=${dateStr} 返回=${b ? '有数据' : 'null'}`)
            basics.push(b)
          } catch (e) {
            // console.log(`[dbg] 第${i}次  date=${dateStr} 抛错=`, e)
            basics.push(null)
          }
        }

        /* ---- 过滤 null 并保证至少 2 条才有差值 ---- */
        const valid = basics.filter((b) => b) as CharacterBasicDto[]
        if (valid.length < 2) return '网络错误（' //有效数据不足（需要至少 2 天）

        //计算升级天数 新增
        const dailyDiffs: number[] = []
        for (let i = 0; i < valid.length - 1; i++) {
          const curr = valid[i]
          const prev = valid[i + 1]
          if (curr.characterLevel === prev.characterLevel) {   // 同等级才统计
            dailyDiffs.push(Number(curr.characterExpRate) - Number(prev.characterExpRate))
          }
        }
        const avgDiff = dailyDiffs.length ? dailyDiffs.reduce((a, b) => a + b, 0) / dailyDiffs.length : 0
        const avgDiffStr = avgDiff.toFixed(3)

        // 【新增】当前缺口
        const currentRate = Number(valid[0].characterExpRate)
        const gap = 100 - currentRate
        const gapStr = gap.toFixed(3)

        // 【新增】预计天数（向上取整，至少 1 天）
        const predictDays = avgDiff <= 0 ? '∞' : Math.max(1, Math.ceil(gap / avgDiff)).toString()

        // 【新增】计算升级日期
        const upgradeDate = new Date(Date.now() + parseInt(predictDays) * 86400_000)
        const upgradeStr = `${upgradeDate.getFullYear()}-${String(upgradeDate.getMonth() + 1).padStart(2, '0')}-${String(upgradeDate.getDate()).padStart(2, '0')}`

        /* ---- 拼装输出 ---- */
        const head = valid[0]
        let lines =
          `${head.characterName}·${head.characterClass} (${head.worldName}@${head.characterGuildName || '无公会'})\n` +
          '经验变化:\n'

        for (let i = 0; i < valid.length - 1; i++) {
          const curr = valid[i]
          const prev = valid[i + 1]
          if (curr.characterLevel > prev.characterLevel) {
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)\n`
          } else {
            const diff = (Number(curr.characterExpRate) - Number(prev.characterExpRate)).toFixed(3)
            const sign = diff.startsWith('-') ? '' : '+'
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)[${sign}${diff}%]\n`
          }
        }
        lines += `----------------------\n日均+${avgDiffStr}%/天\n预计升级还需: ${predictDays} 天\n预计升级日期: ${upgradeStr}\n\n(如若升级则不计算日均增长,可能出现预计数据报错)\n(当日数据可能不准确,下午6点完成更新)`
        // 图片逻辑：有配置且文件存在才发，否则只发文字
        const candidates = config.ms.images?.map(s => s.trim()).filter(Boolean) || [];
        const existFiles = candidates
          .map(f => resolve(__dirname, f))
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
        if (err.constructor.name === 'MapleStoryApiError') return '查询失败，请检查角色名(仅限TMS)'
        // console.error('[msbao %历史]', err)
        return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )'
      }
    })

  // 新增
  ctx.command('%查岗 <name:string>', '查看角色最近7天经验变化') //（18:00后可用）
    .alias('%查崗')
    .action(async ({ session }, name) => {
      if (!canUse(session, config.ms)) return ''
      if (!name) return '请提供角色名'

      // 检查API密钥是否设置
      if (!config.apiKey) {
        return 'API密钥未设置，请联系管理员配置apiKey';
      }

      try {
        const character = await api.getCharacter(name)
        const ocid = character.ocid
        if (!ocid) return '查询失败，请检查角色名'

        /* ---- 时间判断 ---- */
        const tst = new Date(Date.now() + 8 * 3600_000)
        // if (tst.getHours() < 2) return '数据未准备好，凌晨 2 点后再查询'

        /* ---- 生成 7 个日期 ---- */
        function getTstDate(offsetDay: number) {
          const d = new Date(tst.getTime() + offsetDay * 86400_000)
          d.setHours(0, 0, 0, 0)
          return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
        }
        const dates: ({ year: number; month: number; day: number } | null)[] = [null]
        for (let i = 1; i <= 7; i++) dates.push(getTstDate(-i))

        /* ---- 逐个查 + 打印返回 ---- */
        const basics: (CharacterBasicDto | null)[] = []
        for (let i = 0; i < dates.length; i++) {
          const date = dates[i]
          const dateStr = date
            ? `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
            : 'latest'
          try {//
            await new Promise(r => setTimeout(r, config.ms.queryInterval ?? 100));
            const b = date === null
              ? await api.getCharacterBasic(ocid)
              : await api.getCharacterBasic(ocid, date)
            // console.log(`[dbg] 第${i}次  date=${dateStr} 返回=${b ? '有数据' : 'null'}`)
            basics.push(b)
          } catch (e) {
            // console.log(`[dbg] 第${i}次  date=${dateStr} 抛错=`, e)
            basics.push(null)
          }
        }

        /* ---- 过滤 null 并保证至少 2 条才有差值 ---- */
        const valid = basics.filter((b) => b) as CharacterBasicDto[]
        if (valid.length < 2) return '网络错误（' //有效数据不足（需要至少 2 天

        //计算升级天数 新增
        const dailyDiffs: number[] = []
        for (let i = 0; i < valid.length - 1; i++) {
          const curr = valid[i]
          const prev = valid[i + 1]
          if (curr.characterLevel === prev.characterLevel) {   // 同等级才统计
            dailyDiffs.push(Number(curr.characterExpRate) - Number(prev.characterExpRate))
          }
        }
        const avgDiff = dailyDiffs.length ? dailyDiffs.reduce((a, b) => a + b, 0) / dailyDiffs.length : 0
        const avgDiffStr = avgDiff.toFixed(3)

        // 【新增】当前缺口
        const currentRate = Number(valid[0].characterExpRate)
        const gap = 100 - currentRate
        const gapStr = gap.toFixed(3)

        // 【新增】预计天数（向上取整，至少 1 天）
        const predictDays = avgDiff <= 0 ? '∞' : Math.max(1, Math.ceil(gap / avgDiff)).toString()

        // 【新增】计算升级日期
        const upgradeDate = new Date(Date.now() + parseInt(predictDays) * 86400_000)
        const upgradeStr = `${upgradeDate.getFullYear()}-${String(upgradeDate.getMonth() + 1).padStart(2, '0')}-${String(upgradeDate.getDate()).padStart(2, '0')}`

        /* ---- 拼装输出 ---- */
        const head = valid[0]
        let lines =
          `${head.characterName}·${head.characterClass} (${head.worldName}@${head.characterGuildName || '无公会'})\n` +
          '经验变化:\n'

        for (let i = 0; i < valid.length - 1; i++) {
          const curr = valid[i]
          const prev = valid[i + 1]
          if (curr.characterLevel > prev.characterLevel) {
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)\n`
          } else {
            const diff = (Number(curr.characterExpRate) - Number(prev.characterExpRate)).toFixed(3)
            const sign = diff.startsWith('-') ? '' : '+'
            lines += `${i === 0 ? '目  前' : `${i}天前`}: Lv.${curr.characterLevel} (${curr.characterExpRate}%)[${sign}${diff}%]\n`
          }
        }
        lines += `----------------------\n日均+${avgDiffStr}%/天\n预计升级还需: ${predictDays} 天\n预计升级日期: ${upgradeStr}\n\n(如若升级则不计算日均增长,可能出现预计数据报错)\n(当日数据可能不准确,下午6点完成更新)`
        // 图片逻辑：有配置且文件存在才发，否则只发文字
        const candidates = config.ms.images?.map(s => s.trim()).filter(Boolean) || [];
        const existFiles = candidates
          .map(f => resolve(__dirname, f))
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
        if (err.constructor.name === 'MapleStoryApiError') return '查询失败，请检查角色名(仅限TMS)'
        // console.error('[msbao %历史]', err)
        return '查询失败，请稍后再试或联系开发者(布丁@2482457432 )'
      }
    })

  // 新增解绑指令
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