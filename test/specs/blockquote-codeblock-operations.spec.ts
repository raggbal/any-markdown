/**
 * 引用・コードブロック操作テスト
 * - Enter/Shift+Enterの動作
 * - ペースト処理
 * - Cmd+A全選択
 * - Backspaceでの削除
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《引用》Enter/Shift+Enter', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('引用内でEnter → 引用内に改行が挿入される', async ({ page }) => {
        // 引用を作成
        await editor.type('> ');
        await editor.type('line1');
        await editor.press('Enter');
        await editor.type('line2');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('line1');
        expect(html).toContain('line2');
        
        // 両方の行が引用内にあることを確認
        const md = await editor.getMarkdown();
        expect(md).toContain('> line1');
        expect(md).toContain('> line2');
    });

    test('引用内でShift+Enter → 引用を抜けて新しい段落', async ({ page }) => {
        // 引用を作成
        await editor.type('> ');
        await editor.type('quote text');
        
        // Shift+Enterで引用を抜ける
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        await editor.type('outside quote');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('<p>outside quote</p>');
        
        // 引用の外にテキストがあることを確認
        const md = await editor.getMarkdown();
        expect(md).toContain('> quote text');
        expect(md).toContain('outside quote');
        expect(md).not.toContain('> outside quote');
    });
});

test.describe('《コードブロック》Enter/Shift+Enter', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('コードブロック内でEnter → コードブロック内に改行が挿入される', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await editor.type('line1');
        await editor.press('Enter');
        await editor.type('line2');
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        expect(html).toContain('line1');
        expect(html).toContain('line2');
    });

    test('コードブロック内でShift+Enter → コードブロックを抜けて新しい段落', async ({ page }) => {
        // コードブロックをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\ncode\n```');
        });
        await page.waitForTimeout(200);
        
        // コードブロック内をクリックしてフォーカス
        await page.click('#editor pre code');
        await page.waitForTimeout(100);
        
        // Shift+Enterでコードブロックを抜ける
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        await editor.type('outside code');
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        expect(html).toContain('<p>outside code</p>');
    });
});

test.describe('《引用》ペースト', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('引用内にテキストをペースト → プレーンテキストとして挿入', async ({ page }) => {
        // 引用を作成
        await editor.type('> ');
        await page.waitForTimeout(100);
        
        // ペーストイベントをシミュレート
        await page.evaluate(() => {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData?.setData('text/plain', 'pasted text');
            document.getElementById('editor')?.dispatchEvent(pasteEvent);
        });
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('pasted text');
    });

    test('引用内に改行を含むテキストをペースト → 改行が<br>に変換される', async ({ page }) => {
        // 引用を作成
        await editor.type('> ');
        await page.waitForTimeout(100);
        
        // 改行を含むテキストをペースト
        await page.evaluate(() => {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData?.setData('text/plain', 'line1\nline2');
            document.getElementById('editor')?.dispatchEvent(pasteEvent);
        });
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
        expect(html).toContain('line1');
        expect(html).toContain('line2');
        expect(html).toContain('<br>');
    });
});

test.describe('《コードブロック》ペースト', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('コードブロック内にテキストをペースト → プレーンテキストとして挿入', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        // ペーストイベントをシミュレート
        await page.evaluate(() => {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData?.setData('text/plain', 'pasted code');
            document.getElementById('editor')?.dispatchEvent(pasteEvent);
        });
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        expect(html).toContain('pasted code');
    });
});

test.describe('《引用》《コードブロック》Cmd+A全選択', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('引用内でCmd+A → 引用内のテキストのみ選択される', async ({ page }) => {
        // 引用を作成
        await editor.type('> ');
        await editor.type('quote content');
        
        // Cmd+Aで全選択
        await editor.shortcut('a');
        await page.waitForTimeout(100);
        
        // 選択されたテキストを確認
        const selectedText = await page.evaluate(() => {
            return window.getSelection()?.toString() || '';
        });
        
        // 引用内のテキストのみが選択されている
        expect(selectedText).toBe('quote content');
    });

    test('コードブロック内でCmd+A → コードブロック内のテキストのみ選択される', async ({ page }) => {
        // コードブロックをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\ncode content\n```');
        });
        await page.waitForTimeout(200);
        
        // コードブロック内をクリックしてフォーカス
        await page.click('#editor pre code');
        await page.waitForTimeout(100);
        
        // Cmd+A（またはCtrl+A）で全選択
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);
        
        // 選択されたテキストを確認
        const selectedText = await page.evaluate(() => {
            return window.getSelection()?.toString() || '';
        });
        
        // コードブロック内のテキストのみが選択されている
        expect(selectedText).toBe('code content');
    });
});

test.describe('《引用》《コードブロック》Backspace削除', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('空の引用でBackspace → 段落に変換', async ({ page }) => {
        // 引用を作成
        await editor.type('> ');
        await page.waitForTimeout(100);
        
        // Backspaceで削除
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).not.toContain('<blockquote>');
    });

    test('空のコードブロックでBackspace → 段落に変換', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(100);
        
        // Backspaceで削除
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).not.toContain('<pre');
    });
});
