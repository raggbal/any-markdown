/**
 * パターン変換テスト
 * Markdown記法パターンが正しく要素に変換されることを検証
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('ブロック要素パターン変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('# + Space → 《見出し》レベル1', async ({ page }) => {
        await editor.type('# テスト見出し');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h1>');
        expect(html).toContain('テスト見出し');
    });

    test('## + Space → 《見出し》レベル2', async ({ page }) => {
        await editor.type('## テスト見出し');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h2>');
    });

    test('### + Space → 《見出し》レベル3', async ({ page }) => {
        await editor.type('### テスト見出し');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h3>');
    });

    test('- + Space → 《順序なしリスト》', async ({ page }) => {
        await editor.type('- リストアイテム');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
    });

    test('* + Space → 《順序なしリスト》', async ({ page }) => {
        await editor.type('* リストアイテム');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
    });

    test('1. + Space → 《順序付きリスト》', async ({ page }) => {
        await editor.type('1. リストアイテム');
        
        const html = await editor.getHtml();
        expect(html).toContain('<ol>');
        expect(html).toContain('<li>');
    });

    test('> + Space → 《引用》', async ({ page }) => {
        await editor.type('> 引用テキスト');
        
        const html = await editor.getHtml();
        expect(html).toContain('<blockquote>');
    });

    test('--- + Enter → 《水平線》', async ({ page }) => {
        await editor.type('---');
        await editor.press('Enter');
        
        const html = await editor.getHtml();
        expect(html).toContain('<hr>');
    });

    test('既存テキストの行頭で # + Space → 《見出し》に変換', async ({ page }) => {
        // まず通常のテキストを入力
        await editor.type('既存テキスト');
        await editor.press('Enter');
        
        // 新しい行で見出しパターンを入力
        await editor.type('# 新しい見出し');
        
        const html = await editor.getHtml();
        expect(html).toContain('<h1>');
        expect(html).toContain('新しい見出し');
    });
});

test.describe('インライン要素パターン変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('**text** + Space → 《太字》', async ({ page }) => {
        await editor.type('**太字テキスト** ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<strong>');
        expect(html).toContain('太字テキスト');
    });

    test('*text* + Space → 《斜体》', async ({ page }) => {
        await editor.type('*斜体テキスト* ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<em>');
        expect(html).toContain('斜体テキスト');
    });

    test('~~text~~ + Space → 《取り消し線》', async ({ page }) => {
        await editor.type('~~取り消し~~ ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<del>');
        expect(html).toContain('取り消し');
    });

    test('`text` + Space → 《インラインコード》', async ({ page }) => {
        await editor.type('`code` ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<code>');
        expect(html).toContain('code');
    });

    test('文中での **text** + Space → 《太字》', async ({ page }) => {
        await editor.type('これは**太字**です ');
        
        const html = await editor.getHtml();
        expect(html).toContain('<strong>太字</strong>');
    });
});