/**
 * ショートカットキーテスト（要件4、要素の作成方法）
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('見出しショートカット', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('Ctrl+1 → 《見出し》レベル1', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('1');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h1>');
    });

    test('Ctrl+2 → 《見出し》レベル2', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('2');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h2>');
    });

    test('Ctrl+3 → 《見出し》レベル3', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('3');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h3>');
    });

    test('Ctrl+0 → 《段落》に戻す', async ({ page }) => {
        await editor.type('テスト');
        await editor.shortcut('1'); // まず見出しに
        await editor.shortcut('0'); // 段落に戻す
        
        const html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).not.toContain('<h1>');
    });
});

test.describe('ブロック要素ショートカット', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('Ctrl+Shift+U → 《順序なしリスト》', async ({ page }) => {
        await editor.type('アイテム');
        await page.keyboard.press('Control+Shift+U');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
    });

    test('Ctrl+Shift+O → 《順序付きリスト》', async ({ page }) => {
        await editor.type('アイテム');
        await page.keyboard.press('Control+Shift+O');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>');
    });

    test('Ctrl+Shift+Q → 《引用》', async ({ page }) => {
        await editor.type('引用テキスト');
        await page.keyboard.press('Control+Shift+Q');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
    });

    test('Ctrl+Shift+K → 《コードブロック》', async ({ page }) => {
        await editor.type('code');
        await page.keyboard.press('Control+Shift+K');
        
        const html = await editor.getHtml();
        expect(html).toContain('<pre');
        expect(html).toContain('<code>');
    });
});

test.describe('インライン要素ショートカット', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('Ctrl+B → 《太字》（選択テキスト）', async ({ page }) => {
        await editor.type('テスト');
        // 全選択してから太字
        await page.keyboard.down('Shift');
        await page.keyboard.press('Home');
        await page.keyboard.up('Shift');
        await page.keyboard.press('Control+b');
        
        const html = await editor.getHtml();
        expect(html).toMatch(/<(strong|b)>/);
    });

    test('Ctrl+I → 《斜体》（選択テキスト）', async ({ page }) => {
        await editor.type('テスト');
        await page.keyboard.down('Shift');
        await page.keyboard.press('Home');
        await page.keyboard.up('Shift');
        await page.keyboard.press('Control+i');
        
        const html = await editor.getHtml();
        expect(html).toMatch(/<(em|i)>/);
    });

    test('Ctrl+Shift+S → 《取り消し線》（選択テキスト）', async ({ page }) => {
        await editor.type('テスト');
        await page.keyboard.down('Shift');
        await page.keyboard.press('Home');
        await page.keyboard.up('Shift');
        await page.keyboard.press('Control+Shift+S');
        
        const html = await editor.getHtml();
        // 適用時は<del>タグを使用
        expect(html).toContain('<del>');
    });

    test('Ctrl+Shift+S → 《取り消し線》解除', async ({ page }) => {
        // 段落内のテキストを選択するヘルパー関数
        const selectParagraphContent = async () => {
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                const p = editor?.querySelector('p');
                if (p) {
                    const range = document.createRange();
                    range.selectNodeContents(p);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(50);
        };
        
        // まず取り消し線を適用
        await editor.type('テスト');
        await selectParagraphContent();
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        expect(html).toContain('<del>テスト</del>');
        
        // 再度選択して解除
        await selectParagraphContent();
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        expect(html).not.toContain('<del>');
        expect(html).toContain('テスト');
    });
});
