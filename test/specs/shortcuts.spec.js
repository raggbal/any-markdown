"use strict";
/**
 * ショートカットキーテスト（要件4、要素の作成方法）
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const editor_test_helper_1 = require("../utils/editor-test-helper");
test_1.test.describe('見出しショートカット', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });
    (0, test_1.test)('Ctrl+1 → 《見出し》レベル1', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('1');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h1>');
    });
    (0, test_1.test)('Ctrl+2 → 《見出し》レベル2', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('2');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h2>');
    });
    (0, test_1.test)('Ctrl+3 → 《見出し》レベル3', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('3');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h3>');
    });
    (0, test_1.test)('Ctrl+0 → 《段落》に戻す', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('1'); // まず見出しに
        await editor.shortcut('0'); // 段落に戻す
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<p>');
        (0, test_1.expect)(html).not.toContain('<h1>');
    });
});
test_1.test.describe('ブロック要素ショートカット', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });
    (0, test_1.test)('Ctrl+Shift+U → 《順序なしリスト》', async ({ page }) => {
        await editor.type('アイテム');
        await page.keyboard.press('Control+Shift+U');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<ul>');
        (0, test_1.expect)(html).toContain('<li>');
    });
    (0, test_1.test)('Ctrl+Shift+O → 《順序付きリスト》', async ({ page }) => {
        await editor.type('アイテム');
        await page.keyboard.press('Control+Shift+O');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<ol>');
        (0, test_1.expect)(html).toContain('<li>');
    });
    (0, test_1.test)('Ctrl+Shift+Q → 《引用》', async ({ page }) => {
        await editor.type('引用テキスト');
        await page.keyboard.press('Control+Shift+Q');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<blockquote>');
    });
    (0, test_1.test)('Ctrl+Shift+K → 《コードブロック》', async ({ page }) => {
        await editor.type('code');
        await page.keyboard.press('Control+Shift+K');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<pre');
        (0, test_1.expect)(html).toContain('<code>');
    });
});
test_1.test.describe('インライン要素ショートカット', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });
    (0, test_1.test)('Ctrl+B → 《太字》（選択テキスト）', async ({ page }) => {
        await editor.type('テスト');
        // 全選択してから太字
        await page.keyboard.down('Shift');
        await page.keyboard.press('Home');
        await page.keyboard.up('Shift');
        await page.keyboard.press('Control+b');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toMatch(/<(strong|b)>/);
    });
    (0, test_1.test)('Ctrl+I → 《斜体》（選択テキスト）', async ({ page }) => {
        await editor.type('テスト');
        await page.keyboard.down('Shift');
        await page.keyboard.press('Home');
        await page.keyboard.up('Shift');
        await page.keyboard.press('Control+i');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toMatch(/<(em|i)>/);
    });
    (0, test_1.test)('Ctrl+Shift+S → 《取り消し線》（選択テキスト）', async ({ page }) => {
        await editor.type('テスト');
        await page.keyboard.down('Shift');
        await page.keyboard.press('Home');
        await page.keyboard.up('Shift');
        await page.keyboard.press('Control+Shift+S');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toMatch(/<(del|s|strike)>/);
    });
});
//# sourceMappingURL=shortcuts.spec.js.map