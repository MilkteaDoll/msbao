// src/utils/bindings.ts 
import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

export class BindingsManager {
    public bindings: { [qqId: string]: string } = {};
    private readonly filePath: string;

    constructor(dataDir: string) {
        this.filePath = resolve(dataDir, 'bindings.json');

        // 确保目录存在
        if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
        }

        // 初始化绑定数据
        if (existsSync(this.filePath)) {
        try {
            this.bindings = JSON.parse(readFileSync(this.filePath, 'utf-8'));
        } catch (e) {
            console.error('读取绑定数据失败，使用空数据:', e);
            this.bindings = {};
        }
        }
    }

    save() {
        writeFileSync(this.filePath, JSON.stringify(this.bindings, null, 2), 'utf-8');
    }

    getBoundGameId(qqId: string): string | null {
        return this.bindings[qqId] || null;
    }

    bindQQToGameId(qqId: string, gameId: string): void {
        this.bindings[qqId] = gameId;
        this.save();
    }

    unbindQQ(qqId: string): void {
        if (this.bindings.hasOwnProperty(qqId)) {
        delete this.bindings[qqId];
        this.save();
        }
    }
}