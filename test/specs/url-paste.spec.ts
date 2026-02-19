/**
 * URL ペースト自動リンク化テスト
 *
 * 機能1: URLをペーストしたら自動でリンクに変換
 * 機能2: テキスト選択中にURLをペーストしたら、選択テキストをリンクテキストにする
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

// ペーストイベントをシミュレートするヘルパー（plain textのみ、内部Markdownなし）
async function simulateExternalPaste(page, plainText: string) {
    await page.evaluate((text) => {
        const editor = document.getElementById('editor');

        const clipboardData = {
            _data: {
                'text/plain': text,
                'text/html': '',
                // text/x-any-md は設定しない（外部ペーストをシミュレート）
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
    }, plainText);
}

test.describe('URL ペースト自動リンク化', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('URLをペースト → 自動でリンクに変換される', async ({ page }) => {
        // 空の段落にカーソルを置く
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

        // URLをペースト
        await simulateExternalPaste(page, 'https://example.com');
        await page.waitForTimeout(200);

        // <a>タグが生成されていることを確認
        const html = await editor.getHtml();
        expect(html).toContain('<a href="https://example.com">https://example.com</a>');

        // Markdownが正しいことを確認
        const md = await editor.getMarkdown();
        expect(md).toContain('[https://example.com](https://example.com)');
    });

    test('httpのURLもリンクに変換される', async ({ page }) => {
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

        await simulateExternalPaste(page, 'http://example.com/page?q=1&a=2');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).toContain('<a href="http://example.com/page?q=1&amp;a=2"');
    });

    test('テキスト選択中にURLをペースト → 選択テキストがリンクテキストになる', async ({ page }) => {
        // 段落に「クリックここ」を配置
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p>クリックここ</p>';
            // 「ここ」を選択
            const p = editor.querySelector('p');
            const textNode = p.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 4); // 「ここ」の開始位置
            range.setEnd(textNode, 6);   // 「ここ」の終了位置
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        // URLをペースト
        await simulateExternalPaste(page, 'https://example.com');
        await page.waitForTimeout(200);

        // 選択テキストがリンクテキストになっていることを確認
        const html = await editor.getHtml();
        expect(html).toContain('<a href="https://example.com">ここ</a>');
        expect(html).toContain('クリック');

        // Markdownが正しいことを確認
        const md = await editor.getMarkdown();
        expect(md).toContain('クリック[ここ](https://example.com)');
    });

    test('通常テキスト（URLでない）のペーストは従来通り動作する', async ({ page }) => {
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

        await simulateExternalPaste(page, 'これは普通のテキスト');
        await page.waitForTimeout(200);

        // リンクにならないことを確認
        const html = await editor.getHtml();
        expect(html).not.toContain('<a ');
        expect(html).toContain('これは普通のテキスト');
    });

    test('複数行のURLはリンクに変換されない', async ({ page }) => {
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

        await simulateExternalPaste(page, 'https://example.com\nhttps://example2.com');
        await page.waitForTimeout(200);

        // 自動リンクにならず通常のブロックペーストになることを確認
        const html = await editor.getHtml();
        // 2行なのでブロックペーストとして処理される
        expect(html).not.toContain('<a href="https://example.com">https://example.com</a>');
    });

    test('テキスト中にURLをペースト → リンクが挿入される', async ({ page }) => {
        // 「ここに挿入」という段落の「に」の後にカーソルを置く
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p>ここに挿入</p>';
            const p = editor.querySelector('p');
            const textNode = p.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 2); // 「ここ」の後
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateExternalPaste(page, 'https://example.com');
        await page.waitForTimeout(200);

        // テキストの中にリンクが挿入されていることを確認
        const html = await editor.getHtml();
        expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    });

    test('行マタギの選択でURLをペースト → 通常のペースト動作', async ({ page }) => {
        // 2つの段落を配置し、行をまたいで選択
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p>行1のテキスト</p><p>行2のテキスト</p>';
            const p1 = editor.querySelectorAll('p')[0];
            const p2 = editor.querySelectorAll('p')[1];
            const range = document.createRange();
            range.setStart(p1.firstChild, 2); // 行1の途中
            range.setEnd(p2.firstChild, 2);   // 行2の途中
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateExternalPaste(page, 'https://example.com');
        await page.waitForTimeout(200);

        // 行マタギなので自動リンクにはならず、通常のペースト動作
        // （URLはインラインとして処理されるか、ブロックとして処理される）
        const md = await editor.getMarkdown();
        // リンクテキスト化はされないことを確認
        expect(md).not.toContain('[行1のテキスト](https://example.com)');
    });

    test('コードブロック内でURLをペースト → プレーンテキストのまま', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<pre data-lang="javascript" data-mode="edit"><code contenteditable="true"><br></code></pre>';
            const code = editor.querySelector('code');
            const range = document.createRange();
            range.selectNodeContents(code);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);

        await simulateExternalPaste(page, 'https://example.com');
        await page.waitForTimeout(200);

        // コードブロック内ではリンクにならないことを確認
        const html = await editor.getHtml();
        const code = await page.evaluate(() => {
            return document.querySelector('code')?.textContent || '';
        });
        expect(code).toContain('https://example.com');
        expect(html).not.toContain('<a href=');
    });

    test('パスを含むURLもリンクに変換される', async ({ page }) => {
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

        await simulateExternalPaste(page, 'https://github.com/user/repo/issues/123#comment');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).toContain('<a href="https://github.com/user/repo/issues/123#comment"');
    });
});
