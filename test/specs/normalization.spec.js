"use strict";
/**
 * 正規化テスト
 * フェーズ4: Markdown正規化の確認
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const editor_test_helper_1 = require("../utils/editor-test-helper");
test_1.test.describe('《順序なしリスト》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('* マーカー → - に正規化', async ({ page }) => {
        await editor.setMarkdown('* 項目1\n* 項目2');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('- 項目1');
        (0, test_1.expect)(md).toContain('- 項目2');
        (0, test_1.expect)(md).not.toContain('* 項目');
    });
    (0, test_1.test)('+ マーカー → - に正規化', async ({ page }) => {
        await editor.setMarkdown('+ 項目1\n+ 項目2');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('- 項目1');
        (0, test_1.expect)(md).toContain('- 項目2');
        (0, test_1.expect)(md).not.toContain('+ 項目');
    });
});
test_1.test.describe('《順序付きリスト》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('番号が1から連番に正規化', async ({ page }) => {
        await editor.setMarkdown('3. 項目A\n5. 項目B\n7. 項目C');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('1. 項目A');
        (0, test_1.expect)(md).toContain('2. 項目B');
        (0, test_1.expect)(md).toContain('3. 項目C');
    });
});
test_1.test.describe('《ネストリスト》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('インデントが2スペースに正規化', async ({ page }) => {
        await editor.setMarkdown('- 親\n    - 子（4スペース）');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        // 2スペースインデントに正規化されることを確認
        (0, test_1.expect)(md).toMatch(/- 親\n {2}- 子/);
    });
});
test_1.test.describe('《太字》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('__ → ** に正規化', async ({ page }) => {
        await editor.setMarkdown('これは__太字__です');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('**太字**');
        (0, test_1.expect)(md).not.toContain('__太字__');
    });
});
test_1.test.describe('《斜体》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('_ → * に正規化', async ({ page }) => {
        await editor.setMarkdown('これは_斜体_です');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('*斜体*');
        (0, test_1.expect)(md).not.toContain('_斜体_');
    });
});
test_1.test.describe('《水平線》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('*** → --- に正規化', async ({ page }) => {
        await editor.setMarkdown('上\n***\n下');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('---');
        (0, test_1.expect)(md).not.toContain('***');
    });
    (0, test_1.test)('___ → --- に正規化', async ({ page }) => {
        await editor.setMarkdown('上\n___\n下');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('---');
        (0, test_1.expect)(md).not.toContain('___');
    });
});
test_1.test.describe('《コードブロック》正規化', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('~~~ → ``` に正規化', async ({ page }) => {
        await editor.setMarkdown('~~~\ncode\n~~~');
        await page.waitForTimeout(200);
        const md = await editor.getMarkdown();
        (0, test_1.expect)(md).toContain('```');
        (0, test_1.expect)(md).not.toContain('~~~');
    });
});
// === Round-trip特殊ケーステスト ===
test_1.test.describe('Round-trip特殊ケース', () => {
    let editor;
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new editor_test_helper_1.EditorTestHelper(page);
        await editor.focus();
    });
    (0, test_1.test)('画像パスにアンダースコア含むケース', async ({ page }) => {
        const md = '![alt](path/to/image_name_test.png)';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        const result = await editor.getMarkdown();
        // アンダースコアが斜体に変換されないことを確認
        (0, test_1.expect)(result).toContain('image_name_test.png');
        (0, test_1.expect)(result).not.toContain('<em>');
    });
    (0, test_1.test)('空テーブルセル保持', async ({ page }) => {
        const md = '| A | B |\n| --- | --- |\n| 1 |  |\n|  | 2 |';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        const html = await editor.getHtml();
        // テーブルが正しく表示されることを確認
        (0, test_1.expect)(html).toContain('<table');
        (0, test_1.expect)(html).toContain('<td');
    });
    (0, test_1.test)('複数行引用保持', async ({ page }) => {
        const md = '> 1行目\n> 2行目\n> 3行目';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        const result = await editor.getMarkdown();
        // 複数行が保持されることを確認
        (0, test_1.expect)(result).toContain('1行目');
        (0, test_1.expect)(result).toContain('2行目');
        (0, test_1.expect)(result).toContain('3行目');
    });
    (0, test_1.test)('コードブロック言語タグ保持', async ({ page }) => {
        const md = '```javascript\nconst x = 1;\n```';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        const result = await editor.getMarkdown();
        // 言語タグが保持されることを確認
        (0, test_1.expect)(result).toContain('```javascript');
    });
});
//# sourceMappingURL=normalization.spec.js.map