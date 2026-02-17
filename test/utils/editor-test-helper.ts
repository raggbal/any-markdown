/**
 * Playwrightテスト用エディタヘルパー
 */

import { Page, expect } from '@playwright/test';

export class EditorTestHelper {
    constructor(private page: Page) {}

    /**
     * エディタにフォーカス
     */
    async focus() {
        await this.page.locator('#editor').click();
    }

    /**
     * テキスト入力
     */
    async type(text: string) {
        await this.focus();
        await this.page.keyboard.type(text, { delay: 50 });
        // 入力後、エディタの処理を待つ
        await this.page.waitForTimeout(100);
    }

    /**
     * キー押下
     */
    async press(key: string) {
        await this.page.keyboard.press(key);
    }

    /**
     * 複合キー（Ctrl+B等）
     */
    async shortcut(key: string) {
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await this.page.keyboard.press(`${modifier}+${key}`);
    }

    /**
     * Shift+キー
     */
    async shiftPress(key: string) {
        await this.page.keyboard.press(`Shift+${key}`);
    }

    /**
     * 現在のMarkdown取得
     */
    async getMarkdown(): Promise<string> {
        return await this.page.evaluate(() => {
            return (window as any).__testApi?.getMarkdown?.() || '';
        });
    }

    /**
     * 現在のHTML取得
     */
    async getHtml(): Promise<string> {
        return await this.page.evaluate(() => {
            return document.getElementById('editor')?.innerHTML || '';
        });
    }

    /**
     * カーソル位置の要素タグ取得
     */
    async getCursorElementTag(): Promise<string> {
        return await this.page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return '';
            let node: Node | null = sel.anchorNode;
            while (node && node.nodeType !== 1) {
                node = node.parentNode;
            }
            return (node as Element)?.tagName?.toLowerCase() || '';
        });
    }

    /**
     * カーソル位置のテキスト取得
     */
    async getCursorText(): Promise<string> {
        return await this.page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return '';
            let node: Node | null = sel.anchorNode;
            while (node && node.nodeType !== 1) {
                node = node.parentNode;
            }
            return (node as Element)?.textContent || '';
        });
    }

    /**
     * エディタ初期化（Markdown設定）
     */
    async setMarkdown(md: string) {
        await this.page.evaluate((markdown) => {
            (window as any).__testApi?.setMarkdown?.(markdown);
        }, md);
    }

    /**
     * カーソルを行頭に移動
     */
    async moveToLineStart() {
        await this.press('Home');
    }

    /**
     * カーソルを行末に移動
     */
    async moveToLineEnd() {
        await this.press('End');
    }

    /**
     * エディタ内容をクリア
     */
    async clear() {
        await this.focus();
        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.press('Backspace');
    }
}