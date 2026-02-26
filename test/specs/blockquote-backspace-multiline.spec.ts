/**
 * 引用ブロック先頭でBackspace時の複数行→複数段落変換テスト
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《引用》先頭Backspaceで複数行→複数段落変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('複数行の引用ブロック先頭でBackspace → 各行が個別の段落に変換', async ({ page }) => {
        // 引用ブロックをHTMLで直接セット（3行の引用）
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor')!;
            editorEl.innerHTML = '<blockquote>a<br>b<br>c</blockquote>';
            // カーソルを引用ブロックの先頭に配置
            const bq = editorEl.querySelector('blockquote')!;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.setStart(bq.firstChild!, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // blockquoteが消えていること
        expect(html).not.toContain('<blockquote>');

        // 各行が個別の<p>になっていること
        expect(html).toContain('<p>a</p>');
        expect(html).toContain('<p>b</p>');
        expect(html).toContain('<p>c</p>');
    });

    test('1行の引用ブロック先頭でBackspace → 1つの段落に変換', async ({ page }) => {
        // 1行の引用ブロック
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor')!;
            editorEl.innerHTML = '<blockquote>hello</blockquote>';
            const bq = editorEl.querySelector('blockquote')!;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.setStart(bq.firstChild!, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).not.toContain('<blockquote>');
        expect(html).toContain('<p>hello</p>');
    });

    test('空の引用ブロック先頭でBackspace → 空段落に変換', async ({ page }) => {
        // 空の引用ブロック
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor')!;
            editorEl.innerHTML = '<blockquote><br></blockquote>';
            const bq = editorEl.querySelector('blockquote')!;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.setStart(bq, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).not.toContain('<blockquote>');
        expect(html).toMatch(/<p><br><\/p>/);
    });

    test('2行の引用ブロック先頭でBackspace → 2つの段落に変換', async ({ page }) => {
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor')!;
            editorEl.innerHTML = '<blockquote>first line<br>second line</blockquote>';
            const bq = editorEl.querySelector('blockquote')!;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.setStart(bq.firstChild!, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).not.toContain('<blockquote>');
        expect(html).toContain('<p>first line</p>');
        expect(html).toContain('<p>second line</p>');
    });

    test('Backspace後カーソルが最初の段落の先頭にある', async ({ page }) => {
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor')!;
            editorEl.innerHTML = '<blockquote>a<br>b<br>c</blockquote>';
            const bq = editorEl.querySelector('blockquote')!;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.setStart(bq.firstChild!, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        // カーソルが最初の段落の先頭にあること
        const cursorTag = await editor.getCursorElementTag();
        expect(cursorTag).toBe('p');

        const cursorText = await editor.getCursorText();
        expect(cursorText).toBe('a');
    });
});
