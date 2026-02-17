/**
 * 正規化テスト
 * フェーズ4: Markdown正規化の確認
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《順序なしリスト》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500); // Wait for script initialization
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('* マーカー → - に正規化', async ({ page }) => {
        await editor.setMarkdown('* 項目1\n* 項目2');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('- 項目1');
        expect(md).toContain('- 項目2');
        expect(md).not.toContain('* 項目');
    });

    test('+ マーカー → - に正規化', async ({ page }) => {
        await editor.setMarkdown('+ 項目1\n+ 項目2');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('- 項目1');
        expect(md).toContain('- 項目2');
        expect(md).not.toContain('+ 項目');
    });
});

test.describe('《順序付きリスト》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('番号が1から連番に正規化', async ({ page }) => {
        await editor.setMarkdown('3. 項目A\n5. 項目B\n7. 項目C');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('1. 項目A');
        expect(md).toContain('2. 項目B');
        expect(md).toContain('3. 項目C');
    });
});

test.describe('《ネストリスト》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('インデントが2スペースに正規化', async ({ page }) => {
        await editor.setMarkdown('- 親\n    - 子（4スペース）');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        // 2スペースインデントに正規化されることを確認
        expect(md).toMatch(/- 親\n {2}- 子/);
    });
});

test.describe('《太字》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('__ → ** に正規化', async ({ page }) => {
        await editor.setMarkdown('これは__太字__です');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('**太字**');
        expect(md).not.toContain('__太字__');
    });
});

test.describe('《斜体》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('_ → * に正規化', async ({ page }) => {
        await editor.setMarkdown('これは_斜体_です');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('*斜体*');
        expect(md).not.toContain('_斜体_');
    });
});

test.describe('《水平線》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('*** → --- に正規化', async ({ page }) => {
        await editor.setMarkdown('上\n***\n下');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('---');
        expect(md).not.toContain('***');
    });

    test('___ → --- に正規化', async ({ page }) => {
        await editor.setMarkdown('上\n___\n下');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('---');
        expect(md).not.toContain('___');
    });
});

test.describe('《コードブロック》正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('~~~ → ``` に正規化', async ({ page }) => {
        await editor.setMarkdown('~~~\ncode\n~~~');
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md).toContain('```');
        expect(md).not.toContain('~~~');
    });
});


// === インライン装飾の冗長性正規化テスト ===

test.describe('《インライン装飾》冗長性正規化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('重複した太字タグが正規化される', async ({ page }) => {
        // <strong><strong>text</strong></strong> → **text**
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><strong><strong>text</strong></strong></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('**text**');
    });

    test('重複した斜体タグが正規化される', async ({ page }) => {
        // <em><em>text</em></em> → *text*
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><em><em>text</em></em></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('*text*');
    });

    test('重複した取消線タグが正規化される', async ({ page }) => {
        // <del><del>text</del></del> → ~~text~~
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><del><del>text</del></del></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('~~text~~');
    });

    test('隣接する同一タグがマージされる', async ({ page }) => {
        // <strong>a</strong><strong>b</strong> → **ab**
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><strong>a</strong><strong>b</strong></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('**ab**');
    });

    test('空の装飾タグが除去される', async ({ page }) => {
        // <strong></strong>text → text
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><strong></strong>text</p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('text');
    });

    test('複合スタイルが正しく出力される', async ({ page }) => {
        // <del><strong>text</strong></del> → ~~**text**~~
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><del><strong>text</strong></del></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('~~**text**~~');
    });

    test('部分的に重複するスタイルが正しく処理される', async ({ page }) => {
        // <strong>a<del>b</del>c</strong> → **a**~~**b**~~**c**
        // Note: This produces semantically correct output, though not the most compact form.
        // Full optimization (e.g., **a~~b~~c**) would require a more complex algorithm.
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><strong>a<del>b</del>c</strong></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        // Each style boundary creates a new group, so we get separate formatting
        expect(md.trim()).toBe('**a**~~**b**~~**c**');
    });

    test('複雑な冗長パターンが正規化される', async ({ page }) => {
        // 実際のユーザー操作で発生しうる複雑なパターン
        // <del><strong>ds</strong></del><strong><strong>ds</strong></strong>
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><del><strong>ds</strong></del><strong><strong>ds</strong></strong></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        // ~~**ds**~~**ds** が期待される
        expect(md.trim()).toBe('~~**ds**~~**ds**');
    });

    test('太字+斜体の複合スタイル', async ({ page }) => {
        // <strong><em>text</em></strong> → ***text***
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><strong><em>text</em></strong></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('***text***');
    });

    test('全部乗せスタイル（太字+斜体+取消線）', async ({ page }) => {
        // <del><strong><em>text</em></strong></del> → ~~***text***~~
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><del><strong><em>text</em></strong></del></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('~~***text***~~');
    });

    test('リンク内の装飾が正しく処理される', async ({ page }) => {
        // <a href="url"><strong>text</strong></a> → [**text**](url)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><a href="https://example.com"><strong>text</strong></a></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('[**text**](https://example.com)');
    });

    test('インラインコードは装飾を無視する', async ({ page }) => {
        // <code>text</code> → `text`
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor!.innerHTML = '<p><code>text</code></p>';
        });
        await page.waitForTimeout(200);
        
        const md = await editor.getMarkdown();
        expect(md.trim()).toBe('`text`');
    });
});


// === Round-trip特殊ケーステスト ===

test.describe('Round-trip特殊ケース', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        await page.waitForTimeout(500);
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('画像パスにアンダースコア含むケース', async ({ page }) => {
        const md = '![alt](path/to/image_name_test.png)';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        
        const result = await editor.getMarkdown();
        // アンダースコアが斜体に変換されないことを確認
        expect(result).toContain('image_name_test.png');
        expect(result).not.toContain('<em>');
    });

    test('空テーブルセル保持', async ({ page }) => {
        // タイプしてテーブルを作成
        await editor.type('| A | B |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        const html = await editor.getHtml();
        // テーブルが正しく表示されることを確認
        expect(html).toContain('<table');
        expect(html).toContain('<th');
    });

    test('複数行引用保持', async ({ page }) => {
        const md = '> 1行目\n> 2行目\n> 3行目';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        
        const result = await editor.getMarkdown();
        // 複数行が保持されることを確認
        expect(result).toContain('1行目');
        expect(result).toContain('2行目');
        expect(result).toContain('3行目');
    });

    test('コードブロック言語タグ保持', async ({ page }) => {
        const md = '```javascript\nconst x = 1;\n```';
        await editor.setMarkdown(md);
        await page.waitForTimeout(200);
        
        const result = await editor.getMarkdown();
        // 言語タグが保持されることを確認
        expect(result).toContain('```javascript');
    });
});
