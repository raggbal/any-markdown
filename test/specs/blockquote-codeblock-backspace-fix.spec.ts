/**
 * 修正1: 引用ブロック先頭でBackspace → 各行が個別の段落に変換される
 * 修正2: コードブロック編集モードで先頭行先頭Backspace → 空でなければ何もしない
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《修正1》引用ブロック先頭Backspace → 各行が個別段落に変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('3行の引用ブロックで先頭Backspace → 3つの段落に変換', async ({ page }) => {
        // setMarkdownで引用ブロックを設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('> a\n> b\n> c');
        });
        await page.waitForTimeout(300);

        // 引用ブロック内の先頭にカーソルを設定
        await page.evaluate(() => {
            const bq = document.querySelector('#editor blockquote');
            if (!bq) throw new Error('blockquote not found');
            const sel = window.getSelection()!;
            const range = document.createRange();
            // 先頭のテキストノードの先頭にカーソルを置く
            const firstText = bq.firstChild;
            if (firstText && firstText.nodeType === 3) {
                range.setStart(firstText, 0);
            } else {
                range.setStart(bq, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(300);

        // HTMLを確認: blockquoteがなくなり、各行が個別の<p>になっている
        const html = await editor.getHtml();
        expect(html).not.toContain('<blockquote>');
        expect(html).toContain('<p>a</p>');
        expect(html).toContain('<p>b</p>');
        expect(html).toContain('<p>c</p>');
    });

    test('2行の引用ブロックで先頭Backspace → 2つの段落に変換', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('> hello\n> world');
        });
        await page.waitForTimeout(300);

        // 引用ブロック先頭にカーソル
        await page.evaluate(() => {
            const bq = document.querySelector('#editor blockquote');
            if (!bq) throw new Error('blockquote not found');
            const sel = window.getSelection()!;
            const range = document.createRange();
            const firstText = bq.firstChild;
            if (firstText && firstText.nodeType === 3) {
                range.setStart(firstText, 0);
            } else {
                range.setStart(bq, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await editor.press('Backspace');
        await page.waitForTimeout(300);

        const html = await editor.getHtml();
        expect(html).not.toContain('<blockquote>');
        expect(html).toContain('<p>hello</p>');
        expect(html).toContain('<p>world</p>');
    });

    test('1行の引用ブロックで先頭Backspace → 1つの段落に変換', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('> single line');
        });
        await page.waitForTimeout(300);

        await page.evaluate(() => {
            const bq = document.querySelector('#editor blockquote');
            if (!bq) throw new Error('blockquote not found');
            const sel = window.getSelection()!;
            const range = document.createRange();
            const firstText = bq.firstChild;
            if (firstText && firstText.nodeType === 3) {
                range.setStart(firstText, 0);
            } else {
                range.setStart(bq, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await editor.press('Backspace');
        await page.waitForTimeout(300);

        const html = await editor.getHtml();
        expect(html).not.toContain('<blockquote>');
        expect(html).toContain('<p>single line</p>');
    });
});

test.describe('《修正2》コードブロック編集モード先頭Backspace → 空でなければ無効', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('内容ありコードブロックの先頭でBackspace → 何もしない(上の要素が消えない)', async ({ page }) => {
        // 上に段落、下にコードブロック
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('paragraph above\n\n```\ncode content\n```');
        });
        await page.waitForTimeout(300);

        // コードブロックを編集モードにしてカーソルを先頭に設定
        await page.evaluate(async () => {
            const pre = document.querySelector('#editor pre');
            if (!pre) throw new Error('pre not found');
            const code = pre.querySelector('code');
            if (!code) throw new Error('code not found');

            // Enter edit mode manually
            pre.setAttribute('data-mode', 'edit');
            code.setAttribute('contenteditable', 'true');
            // Strip syntax highlighting - get plain text and rebuild
            const text = code.textContent || '';
            code.innerHTML = text.replace(/\n/g, '<br>');

            // Set cursor to the very start of code
            code.focus();
            const sel = window.getSelection()!;
            const range = document.createRange();
            const firstNode = code.firstChild;
            if (firstNode && firstNode.nodeType === 3) {
                range.setStart(firstNode, 0);
            } else {
                range.setStart(code, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            await new Promise(r => setTimeout(r, 100));
        });
        await page.waitForTimeout(200);

        // Backspaceを押す
        await editor.press('Backspace');
        await page.waitForTimeout(300);

        // 段落が残っていることを確認(上の要素が消えていない)
        const html = await editor.getHtml();
        expect(html).toContain('paragraph above');
        // コードブロックも残っている
        expect(html).toContain('<pre');
        expect(html).toContain('code content');
    });

    test('連続コードブロックの下側先頭でBackspace → 上のコードブロックが消えない', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\nb\n```\n\n```\na\n```');
        });
        await page.waitForTimeout(300);

        // 2番目のコードブロックを編集モードにしてカーソルを先頭に設定
        await page.evaluate(async () => {
            const pres = document.querySelectorAll('#editor pre');
            const pre = pres[1];
            if (!pre) throw new Error('second pre not found');
            const code = pre.querySelector('code');
            if (!code) throw new Error('code not found');

            // Enter edit mode manually
            pre.setAttribute('data-mode', 'edit');
            code.setAttribute('contenteditable', 'true');
            const text = code.textContent || '';
            code.innerHTML = text.replace(/\n/g, '<br>');

            // Set cursor to the very start of code
            code.focus();
            const sel = window.getSelection()!;
            const range = document.createRange();
            const firstNode = code.firstChild;
            if (firstNode && firstNode.nodeType === 3) {
                range.setStart(firstNode, 0);
            } else {
                range.setStart(code, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            await new Promise(r => setTimeout(r, 100));
        });
        await page.waitForTimeout(200);

        await editor.press('Backspace');
        await page.waitForTimeout(300);

        // 両方のコードブロックが残っている
        const html = await editor.getHtml();
        const preCount = (html.match(/<pre/g) || []).length;
        expect(preCount).toBe(2);
        expect(html).toContain('b');
        expect(html).toContain('a');
    });

    test('空のコードブロックでBackspace → 段落に変換(既存動作維持)', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\n\n```');
        });
        await page.waitForTimeout(300);

        // コードブロックを編集モードにしてカーソル設定
        await page.evaluate(async () => {
            const pre = document.querySelector('#editor pre');
            if (!pre) throw new Error('pre not found');
            const code = pre.querySelector('code');
            if (!code) throw new Error('code not found');

            // Enter edit mode manually
            pre.setAttribute('data-mode', 'edit');
            code.setAttribute('contenteditable', 'true');
            code.innerHTML = '<br>';

            // Set cursor inside
            code.focus();
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.setStart(code, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            await new Promise(r => setTimeout(r, 100));
        });
        await page.waitForTimeout(200);

        await editor.press('Backspace');
        await page.waitForTimeout(300);

        const html = await editor.getHtml();
        expect(html).not.toContain('<pre');
        expect(html).toContain('<p>');
    });
});
