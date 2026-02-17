"use strict";
/**
 * Playwrightテスト用エディタヘルパー
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorTestHelper = void 0;
class EditorTestHelper {
    page;
    constructor(page) {
        this.page = page;
    }
    /**
     * エディタにフォーカス
     */
    async focus() {
        await this.page.locator('#editor').click();
    }
    /**
     * テキスト入力
     */
    async type(text) {
        await this.focus();
        await this.page.keyboard.type(text, { delay: 50 });
        // 入力後、エディタの処理を待つ
        await this.page.waitForTimeout(100);
    }
    /**
     * キー押下
     */
    async press(key) {
        await this.page.keyboard.press(key);
    }
    /**
     * 複合キー（Ctrl+B等）
     */
    async shortcut(key) {
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await this.page.keyboard.press(`${modifier}+${key}`);
    }
    /**
     * Shift+キー
     */
    async shiftPress(key) {
        await this.page.keyboard.press(`Shift+${key}`);
    }
    /**
     * 現在のMarkdown取得
     */
    async getMarkdown() {
        return await this.page.evaluate(() => {
            return window.__testApi?.getMarkdown?.() || '';
        });
    }
    /**
     * 現在のHTML取得
     */
    async getHtml() {
        return await this.page.evaluate(() => {
            return document.getElementById('editor')?.innerHTML || '';
        });
    }
    /**
     * カーソル位置の要素タグ取得
     */
    async getCursorElementTag() {
        return await this.page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount)
                return '';
            let node = sel.anchorNode;
            while (node && node.nodeType !== 1) {
                node = node.parentNode;
            }
            return node?.tagName?.toLowerCase() || '';
        });
    }
    /**
     * カーソル位置のテキスト取得
     */
    async getCursorText() {
        return await this.page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount)
                return '';
            let node = sel.anchorNode;
            while (node && node.nodeType !== 1) {
                node = node.parentNode;
            }
            return node?.textContent || '';
        });
    }
    /**
     * エディタ初期化（Markdown設定）
     */
    async setMarkdown(md) {
        await this.page.evaluate((markdown) => {
            window.__testApi?.setMarkdown?.(markdown);
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
exports.EditorTestHelper = EditorTestHelper;
//# sourceMappingURL=editor-test-helper.js.map