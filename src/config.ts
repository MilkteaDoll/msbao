// src/config.ts
import { Schema } from 'koishi';

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
        dataPath?: string;
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
        dataPath: Schema.string()
            .description('数据存储目录（留空则使用默认目录）')
            .default('')
            .role('folder'),
    }),
});

export const name = 'msbao';