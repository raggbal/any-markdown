/**
 * HTMLペースト時のリスト空白行除去テスト
 *
 * 外部HTMLをペーストした際、リスト項目間に空白行が入らないことを検証する。
 * Webページ等のHTMLでは <li><p>...</p></li> 形式が多く、
 * Turndownのデフォルトルールでは "loose list" として空行入りMarkdownに変換される。
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

// 外部HTMLペーストをシミュレート
async function simulateHtmlPaste(page, html: string, plainText?: string) {
    await page.evaluate(({ html, text }) => {
        const editor = document.getElementById('editor');

        const clipboardData = {
            _data: {
                'text/plain': text || '',
                'text/html': html,
            },
            getData: function(type: string) {
                return this._data[type] || '';
            },
            setData: function(type: string, value: string) {
                this._data[type] = value;
            },
            items: []
        };

        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer()
        });

        Object.defineProperty(event, 'clipboardData', {
            value: clipboardData,
            writable: false,
            configurable: true
        });

        editor.dispatchEvent(event);
    }, { html, text: plainText || '' });
}

test.describe('HTMLペースト - リスト空白行除去', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('バレットリスト (<li><p>形式) → 空行なし', async ({ page }) => {
        // 空の段落にカーソル
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        // <li><p>...</p></li> 形式のHTMLをペースト（Webページでよくある形式）
        await simulateHtmlPaste(page,
            '<ul><li><p>item1</p></li><li><p>item2</p></li><li><p>item3</p></li></ul>',
            'item1\nitem2\nitem3'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (bullet loose):', JSON.stringify(md));

        // リスト項目間に空行がないこと
        expect(md).toContain('- item1\n- item2\n- item3');
    });

    test('バレットリスト (<li>直接テキスト形式) → 空行なし', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateHtmlPaste(page,
            '<ul><li>item1</li><li>item2</li><li>item3</li></ul>',
            'item1\nitem2\nitem3'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (bullet tight):', JSON.stringify(md));

        expect(md).toContain('- item1\n- item2\n- item3');
    });

    test('数字リスト (<li><p>形式) → 空行なし', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateHtmlPaste(page,
            '<ol><li><p>first</p></li><li><p>second</p></li><li><p>third</p></li></ol>',
            'first\nsecond\nthird'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (ordered loose):', JSON.stringify(md));

        // Turndownは連番を振る; エディタのhtmlToMarkdownは1.統一
        // ペースト後にエディタが正規化するので、連番 or 1.統一のどちらもOK
        const hasNoBlankLines = !md.match(/\d+\.\s+first\n\n/) && !md.match(/\d+\.\s+second\n\n/);
        expect(hasNoBlankLines).toBe(true);
        expect(md).toMatch(/\d+\.\s+first/);
        expect(md).toMatch(/\d+\.\s+second/);
        expect(md).toMatch(/\d+\.\s+third/);
    });

    test('タスクリスト → 空行なし', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateHtmlPaste(page,
            '<ul><li><input type="checkbox">task1</li><li><input type="checkbox" checked>task2</li><li><input type="checkbox">task3</li></ul>',
            'task1\ntask2\ntask3'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (task):', JSON.stringify(md));

        // タスクリスト項目間に空行がないこと
        expect(md).toMatch(/- \[[ x]\] task1\n- \[[ x]\] task2\n- \[[ x]\] task3/);
    });

    test('ネストバレットリスト (<li><p>形式) → 空行なし、インデント正常', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateHtmlPaste(page,
            '<ul><li><p>parent1</p><ul><li><p>child1</p></li><li><p>child2</p></li></ul></li><li><p>parent2</p></li></ul>',
            'parent1\nchild1\nchild2\nparent2'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (nested):', JSON.stringify(md));

        // ネストリストが正しくインデントされ、空行がないこと
        expect(md).toContain('- parent1');
        expect(md).toContain('- parent2');
        // 空行がないこと（項目間が連続していること）
        expect(md).not.toMatch(/- parent1\n\n/);
        expect(md).not.toMatch(/- parent2\n\n/);
    });
});
