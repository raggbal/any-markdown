/**
 * プレースホルダーがペースト後に消えることを確認するテスト
 *
 * バグ: 空エディタでCMD+Vペーストすると、プレースホルダーが消えずに残る
 * 原因: pasteハンドラがe.preventDefault()するためinputイベントが発火せず、
 *        updatePlaceholder()が呼ばれない
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

// ペーストイベントをシミュレート
async function simulateExternalPaste(page, plainText: string) {
    await page.evaluate((text) => {
        const editor = document.getElementById('editor');

        const clipboardData = {
            _data: {
                'text/plain': text,
                'text/html': '',
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

test.describe('プレースホルダー ペースト後の非表示', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('空エディタにインラインテキストをペースト → プレースホルダーが消える', async ({ page }) => {
        // 空エディタの状態を作る
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            editor.classList.add('is-empty');
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        // プレースホルダーが表示されていることを確認
        const hasPlaceholderBefore = await page.evaluate(() => {
            return document.getElementById('editor').classList.contains('is-empty');
        });
        expect(hasPlaceholderBefore).toBe(true);

        // テキストをペースト
        await simulateExternalPaste(page, 'Hello World');
        await page.waitForTimeout(200);

        // プレースホルダーが消えていることを確認
        const hasPlaceholderAfter = await page.evaluate(() => {
            return document.getElementById('editor').classList.contains('is-empty');
        });
        expect(hasPlaceholderAfter).toBe(false);
    });

    test('空エディタにブロック要素をペースト → プレースホルダーが消える', async ({ page }) => {
        // 空エディタの状態を作る
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            editor.classList.add('is-empty');
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        // ブロック要素（見出し）をペースト
        await simulateExternalPaste(page, '# Hello World');
        await page.waitForTimeout(200);

        // プレースホルダーが消えていることを確認
        const hasPlaceholderAfter = await page.evaluate(() => {
            return document.getElementById('editor').classList.contains('is-empty');
        });
        expect(hasPlaceholderAfter).toBe(false);
    });

    test('空エディタにURLをペースト → プレースホルダーが消える', async ({ page }) => {
        // 空エディタの状態を作る
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<p><br></p>';
            editor.classList.add('is-empty');
            const p = editor.querySelector('p');
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        // URLをペースト
        await simulateExternalPaste(page, 'https://example.com');
        await page.waitForTimeout(200);

        // プレースホルダーが消えていることを確認
        const hasPlaceholderAfter = await page.evaluate(() => {
            return document.getElementById('editor').classList.contains('is-empty');
        });
        expect(hasPlaceholderAfter).toBe(false);
    });
});
