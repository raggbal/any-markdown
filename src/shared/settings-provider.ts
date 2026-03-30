/**
 * SettingsProvider — エディタ設定の読み書きを抽象化するインターフェース
 *
 * VSCode: vscode.workspace.getConfiguration('fractal') をラップ
 * Electron: electron-store ベースの実装 (フェーズ3)
 */

export interface EditorSettings {
    theme: 'github' | 'sepia' | 'night' | 'dark' | 'minimal' | 'perplexity';
    fontSize: number;
    toolbarMode: 'full' | 'simple';
    language: 'default' | 'en' | 'ja' | 'zh-TW' | 'zh-CN' | 'ko' | 'es' | 'fr';
    imageDefaultDir: string;
    forceRelativeImagePath: boolean;
    enableDebugLogging: boolean;
}

export const DEFAULT_SETTINGS: EditorSettings = {
    theme: 'github',
    fontSize: 16,
    toolbarMode: 'simple',
    language: 'default',
    imageDefaultDir: '',
    forceRelativeImagePath: false,
    enableDebugLogging: false,
};

export interface SettingsProvider {
    get<K extends keyof EditorSettings>(key: K): EditorSettings[K];
    getAll(): EditorSettings;
    onChange(callback: () => void): { dispose(): void };
}
