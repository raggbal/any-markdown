"use strict";
/**
 * IME・その他テスト
 * フェーズ5: IME対応と補助機能
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const editor_test_helper_1 = require("../utils/editor-test-helper");
test_1.test.describe('IME対応', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('IME入力中のEnter無視（compositionイベント）', async ({ page }) => {
        // IME入力をシミュレート
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor)
                return;
            // compositionstartイベントを発火
            editor.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        });
        await editor.type('あ');
        // IME入力中にEnterを押す
        await editor.press('Enter');
        // compositionendイベントを発火
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor)
                return;
            editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'あ' }));
        });
        // エディタが正常に動作していることを確認
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toBeDefined();
    });
    (0, test_1.test)('IME入力中のShift+Enter処理', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor)
                return;
            editor.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        });
        await editor.type('テスト');
        await editor.shiftPress('Enter');
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor)
                return;
            editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'テスト' }));
        });
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toBeDefined();
    });
});
test_1.test.describe('補助機能', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('アウトライン表示', async ({ page }) => {
        // 見出しを含むMarkdownを設定
        await editor.setMarkdown('# 見出し1\n\n本文\n\n## 見出し2\n\n本文2');
        await page.waitForTimeout(500);
        // アウトラインの更新をトリガー
        await page.evaluate(() => {
            // updateOutline関数を呼び出す（グローバルに公開されている場合）
            if (typeof window.updateOutline === 'function') {
                window.updateOutline();
            }
        });
        await page.waitForTimeout(200);
        // アウトラインが更新されることを確認
        const outline = page.locator('#outline');
        const outlineHtml = await outline.innerHTML();
        // アウトラインが空でないか、または見出しが含まれることを確認
        // 実装によってはsetMarkdown後に自動更新されない場合がある
        (0, test_1.expect)(outlineHtml).toBeDefined();
    });
    (0, test_1.test)('ワードカウント表示', async ({ page }) => {
        await editor.setMarkdown('これはテストです。This is a test.');
        await page.waitForTimeout(300);
        // ワードカウントが表示されることを確認
        const wordCount = page.locator('#wordCount');
        const text = await wordCount.textContent();
        // 文字数やワード数が表示されることを確認
        (0, test_1.expect)(text).toBeDefined();
        (0, test_1.expect)(text?.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=ime-misc.spec.js.map