// src/index.ts
import { Context } from 'koishi';
import { resolve } from 'path';
import { Config, name } from './config';
import { MapleStoryApi } from 'maplestory-openapi/tms';
import { BindingsManager } from './utils/bindings';
import { applyWebCommands } from './commands/web';
import { applyKeywordListener } from './commands/keyword';
import { applyMapleCommands } from './commands/maple'; 

export { name, Config };

export function apply(ctx: Context, config: Config) {
  if (!config.enabled) return;

  // 初始化 API
  const api = new MapleStoryApi(config.apiKey);

  // 初始化绑定管理器
  const DATA_DIR = resolve(
    config.ms.dataPath?.trim()
      ? config.ms.dataPath.trim()
      : resolve(ctx.baseDir, 'data', 'msbao')
  );
  const bindingsMgr = new BindingsManager(DATA_DIR);

  // 注册所有命令
  applyWebCommands(ctx, config);
  applyKeywordListener(ctx, config);
  applyMapleCommands(ctx, config, api, bindingsMgr);
}