"use strict";
/**
 * パターン変換テスト
 * Markdown記法パターンが正しく要素に変換されることを検証
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const editor_test_helper_1 = require("../utils/editor-test-helper");
test_1.test.describe('ブロック要素パターン変換', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });
    (0, test_1.test)('# + Space → 《見出し》レベル1', async ({ page }) => {
        await editor.type('# テスト見出し');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h1>');
        (0, test_1.expect)(html).toContain('テスト見出し');
    });
    (0, test_1.test)('## + Space → 《見出し》レベル2', async ({ page }) => {
        await editor.type('## テスト見出し');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h2>');
    });
    (0, test_1.test)('### + Space → 《見出し》レベル3', async ({ page }) => {
        await editor.type('### テスト見出し');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h3>');
    });
    (0, test_1.test)('- + Space → 《順序なしリスト》', async ({ page }) => {
        await editor.type('- リストアイテム');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<ul>');
        (0, test_1.expect)(html).toContain('<li>');
    });
    (0, test_1.test)('* + Space → 《順序なしリスト》', async ({ page }) => {
        await editor.type('* リストアイテム');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<ul>');
        (0, test_1.expect)(html).toContain('<li>');
    });
    (0, test_1.test)('1. + Space → 《順序付きリスト》', async ({ page }) => {
        await editor.type('1. リストアイテム');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<ol>');
        (0, test_1.expect)(html).toContain('<li>');
    });
    (0, test_1.test)('> + Space → 《引用》', async ({ page }) => {
        await editor.type('> 引用テキスト');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<blockquote>');
    });
    (0, test_1.test)('--- + Enter → 《水平線》', async ({ page }) => {
        await editor.type('---');
        await editor.press('Enter');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<hr>');
    });
    (0, test_1.test)('既存テキストの行頭で # + Space → 《見出し》に変換', async ({ page }) => {
        // まず通常のテキストを入力
        await editor.type('既存テキスト');
        await editor.press('Enter');
        // 新しい行で見出しパターンを入力
        await editor.type('# 新しい見出し');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<h1>');
        (0, test_1.expect)(html).toContain('新しい見出し');
    });
});
test_1.test.describe('インライン要素パターン変換', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });
    (0, test_1.test)('**text** + Space → 《太字》', async ({ page }) => {
        await editor.type('**太字テキスト** ');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<strong>');
        (0, test_1.expect)(html).toContain('太字テキスト');
    });
    (0, test_1.test)('*text* + Space → 《斜体》', async ({ page }) => {
        await editor.type('*斜体テキスト* ');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<em>');
        (0, test_1.expect)(html).toContain('斜体テキスト');
    });
    (0, test_1.test)('~~text~~ + Space → 《取り消し線》', async ({ page }) => {
        await editor.type('~~取り消し~~ ');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<del>');
        (0, test_1.expect)(html).toContain('取り消し');
    });
    (0, test_1.test)('`text` + Space → 《インラインコード》', async ({ page }) => {
        await editor.type('`code` ');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<code>');
        (0, test_1.expect)(html).toContain('code');
    });
    (0, test_1.test)('文中での **text** + Space → 《太字》', async ({ page }) => {
        await editor.type('これは**太字**です ');
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<strong>太字</strong>');
    });
});
//# sourceMappingURL=pattern.spec.js.map