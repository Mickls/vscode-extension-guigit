import * as vscode from 'vscode';
import { i18n } from '../utils/i18n';

export class LanguageService {
    private static instance: LanguageService;
    private configSection = 'guigit';
    
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
        
        if (language === 'auto') {
            // 自动检测系统语言
            const systemLanguage = vscode.env.language;
            this.setLanguage(systemLanguage.startsWith('zh') ? 'zh' : 'en');
        } else {
            this.setLanguage(language);
        }
        
        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(`${this.configSection}.language`)) {
                const newLanguage = vscode.workspace.getConfiguration(this.configSection).get<string>('language', 'auto');
                if (newLanguage === 'auto') {
                    const systemLanguage = vscode.env.language;
                    this.setLanguage(systemLanguage.startsWith('zh') ? 'zh' : 'en');
                } else {
                    this.setLanguage(newLanguage);
                }
                
                // 通知UI刷新
                vscode.commands.executeCommand('guigit.refresh');
            }
        });
    }
    
    public setLanguage(language: string) {
        const supportedLanguages = ['en', 'zh'];
        if (supportedLanguages.includes(language)) {
            i18n.setLocale(language);
            
            // 保存到配置
            const config = vscode.workspace.getConfiguration(this.configSection);
            config.update('language', language, vscode.ConfigurationTarget.Global);
            
            // 触发语言变化事件
            this._onLanguageChange.fire();
        }
    }
    
    public getCurrentLanguage(): string {
        return i18n.getCurrentLocale();
    }
    
    public getSupportedLanguages(): { label: string; value: string }[] {
        return [
            { label: 'English', value: 'en' },
            { label: '中文', value: 'zh' }
        ];
    }
    
    public async showLanguageSelector() {
        const languages = this.getSupportedLanguages();
        const currentLanguage = this.getCurrentLanguage();
        
        const items = languages.map(lang => ({
            label: lang.label,
            description: lang.value === currentLanguage ? '✓' : ''
        }));
        
        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select language',
            title: 'GUI Git History Language'
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