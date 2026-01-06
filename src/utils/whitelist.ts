// src/utils/whitelist.ts 
import { Session } from 'koishi';
import { Config } from '../config';

export function canUse(session: Session, config: Config, item: { useGlobalwlist?: boolean; selfWhitelist?: string[] }): boolean {
    if (!session.guildId) return true;
    if (item.useGlobalwlist !== false) {
        return !config.whitelistMode || config.whitelist.includes(session.channelId);
    }
    const self = item.selfWhitelist || [];
    if (self.length === 0) return true;
    return self.includes(session.channelId);
}