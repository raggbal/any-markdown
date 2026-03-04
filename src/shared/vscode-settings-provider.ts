/**
 * VSCode SettingsProvider — vscode.workspace.getConfiguration をラップ
 */
import * as vscode from 'vscode';
import { EditorSettings, SettingsProvider, DEFAULT_SETTINGS } from './settings-provider';

export class VSCodeSettingsProvider implements SettingsProvider {
    private get config() {
        return vscode.workspace.getConfiguration('any-markdown');
    }

    get<K extends keyof EditorSettings>(key: K): EditorSettings[K] {
        return this.config.get<EditorSettings[K]>(key, DEFAULT_SETTINGS[key])!;
    }

    getAll(): EditorSettings {
        return {
            theme: this.get('theme'),
            fontSize: this.get('fontSize'),
            toolbarMode: this.get('toolbarMode'),
            language: this.get('language'),
            imageDefaultDir: this.get('imageDefaultDir'),
            forceRelativeImagePath: this.get('forceRelativeImagePath'),
            enableDebugLogging: this.get('enableDebugLogging'),
        };
    }

    onChange(callback: () => void): { dispose(): void } {
        const disposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('any-markdown')) {
                callback();
            }
        });
        return disposable;
    }

    /**
     * VSCode のシステム言語を返す
     */
    getSystemLanguage(): string {
        return vscode.env.language;
    }
}
