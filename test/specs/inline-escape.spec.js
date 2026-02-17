"use strict";
/**
 * インライン要素脱出テスト（要件15）
 * 終了マーカー + Space でインライン要素から脱出することを検証
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const editor_test_helper_1 = require("../utils/editor-test-helper");
test_1.test.describe('インライン要素脱出', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });
    (0, test_1.test)('《太字》内で ** + Space → 脱出', async ({ page }) => {
        // まず太字を作成
        await editor.type('**太字** ');
        // 太字要素内にカーソルを移動（太字テキストの末尾）
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        // 終了マーカー + Space を入力
        await editor.type('** ');
        // カーソルが太字要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        (0, test_1.expect)(tag).not.toBe('strong');
    });
    (0, test_1.test)('《斜体》内で * + Space → 脱出', async ({ page }) => {
        // まず斜体を作成
        await editor.type('*斜体* ');
        // 斜体要素内にカーソルを移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        // 終了マーカー + Space を入力
        await editor.type('* ');
        // カーソルが斜体要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        (0, test_1.expect)(tag).not.toBe('em');
    });
    (0, test_1.test)('《取り消し線》内で ~~ + Space → 脱出', async ({ page }) => {
        // まず取り消し線を作成
        await editor.type('~~取り消し~~ ');
        // 取り消し線要素内にカーソルを移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        // 終了マーカー + Space を入力
        await editor.type('~~ ');
        // カーソルが取り消し線要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        (0, test_1.expect)(tag).not.toBe('del');
    });
    (0, test_1.test)('《インラインコード》内で ` + Space → 脱出', async ({ page }) => {
        // まずインラインコードを作成
        await editor.type('`code` ');
        // インラインコード要素内にカーソルを移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        // 終了マーカー + Space を入力
        await editor.type('` ');
        // カーソルがインラインコード要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        (0, test_1.expect)(tag).not.toBe('code');
    });
    (0, test_1.test)('脱出後の入力は書式なし', async ({ page }) => {
        // 太字を作成して脱出
        await editor.type('**太字** ');
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        await editor.type('** ');
        // 脱出後にテキストを入力
        await editor.type('通常テキスト');
        // HTMLを確認 - 「通常テキスト」がstrong内にないこと
        const html = await editor.getHtml();
        (0, test_1.expect)(html).toContain('<strong>');
        (0, test_1.expect)(html).not.toContain('<strong>太字通常テキスト</strong>');
    });
});
//# sourceMappingURL=inline-escape.spec.js.map