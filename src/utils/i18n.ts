import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class I18nService {
    private static instance: I18nService;
    private currentLocale: string = 'en';
    private translations: any = {};
    
    private constructor() {
        // 私有构造函数
    }
    
    public static getInstance(): I18nService {
        if (!I18nService.instance) {
            I18nService.instance = new I18nService();
        }
        return I18nService.instance;
    }
    
    public setLocale(locale: string): void {
        this.currentLocale = locale;
        this.loadTranslations();
    }
    
    public getCurrentLocale(): string {
        return this.currentLocale;
    }

    public getTranslations(): any {
        return this.translations;
    }
    
    private loadTranslations(): void {
        try {
            const translationPath = path.join(__dirname, '../../i18n', `${this.currentLocale}.json`);
            if (fs.existsSync(translationPath)) {
                const data = fs.readFileSync(translationPath, 'utf8');
                const parsed = JSON.parse(data);
                this.translations = parsed.messages || {};
            } else {
                // 后备到英文
                const enPath = path.join(__dirname, '../../i18n', 'en.json');
                const enData = fs.readFileSync(enPath, 'utf8');
                const enParsed = JSON.parse(enData);
                this.translations = enParsed.messages || {};
            }
        } catch (error) {
            console.error('Failed to load translations:', error);
            this.translations = {};
        }
    }
    
    public t(key: string, ...args: any[]): string {
        const message = this.getMessage(key);
        if (args.length > 0) {
            return this.formatMessage(message, args);
        }
        return message;
    }
    
    private getMessage(key: string): string {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // 如果找不到翻译，返回键本身
                return key;
            }
        }
        
        return typeof value === 'string' ? value : key;
    }
    
    private formatMessage(message: string, args: any[]): string {
        return message.replace(/\{(\d+)\}/g, (match, index) => {
            const idx = parseInt(index, 10);
            return args[idx] !== undefined ? String(args[idx]) : match;
        });
    }
}

// 创建单例实例
export const i18n = I18nService.getInstance();