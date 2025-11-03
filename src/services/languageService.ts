import * as vscode from 'vscode';
import { i18n } from '../utils/i18n';

export class LanguageService {
    private static instance: LanguageService;
    private configSection = 'guigit';
    private readonly supportedLanguages = [
        { label: 'English', value: 'en' },
        { label: '中文', value: 'zh' },
        { label: 'Español', value: 'es' },
        { label: 'Français', value: 'fr' },
        { label: 'Deutsch', value: 'de' },
        { label: '日本語', value: 'ja' },
        { label: 'Русский', value: 'ru' }
    ];
    
    private constructor() {
        this.initializeLanguage();
    }
    
    private _onLanguageChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onLanguageChange: vscode.Event<void> = this._onLanguageChange.event;
    
    public static getInstance(): LanguageService {
        if (!LanguageService.instance) {
            LanguageService.instance = new LanguageService();
        }
        return LanguageService.instance;
    }
    
    private initializeLanguage() {
        const config = vscode.workspace.getConfiguration(this.configSection);
        const language = config.get<string>('language', 'auto');
        
        const initialLanguage = this.resolveInitialLanguage(language);
        i18n.setLocale(initialLanguage);
        
        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(`${this.configSection}.language`)) {
                const newLanguage = vscode.workspace.getConfiguration(this.configSection).get<string>('language', 'auto');
                if (newLanguage === 'auto') {
                    const systemLanguage = vscode.env.language;
                    const resolved = this.resolveLanguage(systemLanguage);
                    this.setLanguage(resolved);
                } else {
                    this.setLanguage(newLanguage);
                }
                
                // 通知UI刷新
                vscode.commands.executeCommand('guigit.refresh');
            }
        });
    }
    
    private resolveLanguage(locale: string | undefined | null): string {
        if (!locale) {
            return 'en';
        }

        const normalized = locale.toLowerCase();
        const exactMatch = this.supportedLanguages.find(lang => lang.value === normalized);
        if (exactMatch) {
            return exactMatch.value;
        }

        const base = normalized.split('-')[0];
        const baseMatch = this.supportedLanguages.find(lang => lang.value === base);
        return baseMatch ? baseMatch.value : 'en';
    }

    private resolveInitialLanguage(configValue: string): string {
        if (configValue === 'auto') {
            // 自动检测系统语言
            const systemLanguage = vscode.env.language;
            return this.resolveLanguage(systemLanguage);
        }

        const explicitLanguage = this.resolveLanguage(configValue);
        const availableLanguages = this.supportedLanguages.map(lang => lang.value);
        return availableLanguages.includes(explicitLanguage) ? explicitLanguage : 'en';
    }
    
    public setLanguage(language: string) {
        const availableLanguages = this.supportedLanguages.map(lang => lang.value);
        const targetLanguage = this.resolveLanguage(language);

        if (!availableLanguages.includes(targetLanguage)) {
            return;
        }

        const currentLocale = i18n.getCurrentLocale();
        const config = vscode.workspace.getConfiguration(this.configSection);
        const configuredLanguage = config.get<string>('language', 'auto');

        if (currentLocale === targetLanguage && configuredLanguage === targetLanguage) {
            return;
        }

        i18n.setLocale(targetLanguage);

        if (configuredLanguage !== targetLanguage) {
            config.update('language', targetLanguage, vscode.ConfigurationTarget.Global);
        }
        
        this._onLanguageChange.fire();
    }
    
    public getCurrentLanguage(): string {
        return i18n.getCurrentLocale();
    }
    
    public getSupportedLanguages(): { label: string; value: string }[] {
        return this.supportedLanguages.slice();
    }
    
    public async showLanguageSelector() {
        const languages = this.getSupportedLanguages();
        const currentLanguage = this.getCurrentLanguage();
        
        const items = languages.map(lang => ({
            label: lang.label,
            description: lang.value,
            picked: lang.value === currentLanguage
        }));
        
        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select language',
            title: 'GUI Git History Language',
            matchOnDescription: true
        });
        
        if (selection) {
            const selectedLanguage = languages.find(lang => lang.label === selection.label);
            if (selectedLanguage) {
                this.setLanguage(selectedLanguage.value);
                vscode.window.showInformationMessage(`Language changed to ${selection.label}`);
            }
        }
    }
}
