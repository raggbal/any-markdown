/**
 * インライン要素脱出テスト（要件15）
 * 終了マーカー + Space でインライン要素から脱出することを検証
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('インライン要素脱出', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('《太字》内で ** + Space → 脱出', async ({ page }) => {
        // まず太字を作成
        await editor.type('**太字** ');
        
        // 太字要素内にカーソルを移動（太字テキストの末尾）
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        
        // 終了マーカー + Space を入力
        await editor.type('** ');
        
        // カーソルが太字要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).not.toBe('strong');
    });

    test('《斜体》内で * + Space → 脱出', async ({ page }) => {
        // まず斜体を作成
        await editor.type('*斜体* ');
        
        // 斜体要素内にカーソルを移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        
        // 終了マーカー + Space を入力
        await editor.type('* ');
        
        // カーソルが斜体要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).not.toBe('em');
    });

    test('《取り消し線》内で ~~ + Space → 脱出', async ({ page }) => {
        // まず取り消し線を作成
        await editor.type('~~取り消し~~ ');
        
        // 取り消し線要素内にカーソルを移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        
        // 終了マーカー + Space を入力
        await editor.type('~~ ');
        
        // カーソルが取り消し線要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).not.toBe('del');
    });

    test('《インラインコード》内で ` + Space → 脱出', async ({ page }) => {
        // まずインラインコードを作成
        await editor.type('`code` ');
        
        // インラインコード要素内にカーソルを移動
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        
        // 終了マーカー + Space を入力
        await editor.type('` ');
        
        // カーソルがインラインコード要素の外にあることを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).not.toBe('code');
    });

    test('脱出後の入力は書式なし', async ({ page }) => {
        // 太字を作成して脱出
        await editor.type('**太字** ');
        await editor.press('ArrowLeft');
        await editor.press('ArrowLeft');
        await editor.type('** ');
        
        // 脱出後にテキストを入力
        await editor.type('通常テキスト');
        
        // HTMLを確認 - 「通常テキスト」がstrong内にないこと
        const html = await editor.getHtml();
        expect(html).toContain('<strong>');
        expect(html).not.toContain('<strong>太字通常テキスト</strong>');
    });
});

test.describe('インライン要素内でのShift+Enter', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('《太字》内でShift+Enter → 要素を閉じて改行', async ({ page }) => {
        // 太字を作成（スペースで変換をトリガー）
        await editor.type('**太字テスト** ');
        
        // 太字要素が作成されていることを確認
        const html1 = await editor.getHtml();
        expect(html1).toContain('<strong>太字テスト</strong>');
        
        // 太字要素内にカーソルを移動
        await page.evaluate(() => {
            const strong = document.querySelector('#editor strong');
            if (strong) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(strong);
                range.collapse(false); // 末尾に移動
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        
        // Shift+Enterを押す
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        // HTMLを確認 - 太字が閉じられてbrが挿入されていること
        const html2 = await editor.getHtml();
        expect(html2).toContain('<strong>太字テスト</strong>');
        expect(html2).toContain('<br>');
    });

    test('《斜体》内でShift+Enter → 要素を閉じて改行', async ({ page }) => {
        // 斜体を作成
        await editor.type('*斜体テスト* ');
        
        const html1 = await editor.getHtml();
        expect(html1).toContain('<em>斜体テスト</em>');
        
        // 斜体要素内にカーソルを移動
        await page.evaluate(() => {
            const em = document.querySelector('#editor em');
            if (em) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(em);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        
        // Shift+Enterを押す
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        // HTMLを確認 - 斜体が閉じられてbrが挿入されていること
        const html2 = await editor.getHtml();
        expect(html2).toContain('<em>斜体テスト</em>');
        expect(html2).toContain('<br>');
    });

    test('《インラインコード》内でShift+Enter → 要素を閉じて改行', async ({ page }) => {
        // インラインコードを作成
        await editor.type('`codeテスト` ');
        
        const html1 = await editor.getHtml();
        expect(html1).toContain('<code>codeテスト</code>');
        
        // インラインコード要素内にカーソルを移動
        await page.evaluate(() => {
            const code = document.querySelector('#editor p code');
            if (code) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(code);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        
        // Shift+Enterを押す
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        // HTMLを確認 - インラインコードが閉じられてbrが挿入されていること
        const html2 = await editor.getHtml();
        expect(html2).toContain('<code>codeテスト</code>');
        expect(html2).toContain('<br>');
    });

    test('《取り消し線》内でShift+Enter → 要素を閉じて改行', async ({ page }) => {
        // 取り消し線を作成
        await editor.type('~~削除テスト~~ ');
        
        const html1 = await editor.getHtml();
        expect(html1).toContain('<del>削除テスト</del>');
        
        // 取り消し線要素内にカーソルを移動
        await page.evaluate(() => {
            const del = document.querySelector('#editor del');
            if (del) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(del);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        
        // Shift+Enterを押す
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        // HTMLを確認 - 取り消し線が閉じられてbrが挿入されていること
        const html2 = await editor.getHtml();
        expect(html2).toContain('<del>削除テスト</del>');
        expect(html2).toContain('<br>');
    });
});
