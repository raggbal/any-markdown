/**
 * リストマージテスト（要件11B）
 * パターン変換時の隣接リストマージを検証
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('順序なしリストのマージ', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('リストの下の段落で「- 」→ リストの末尾に追加される', async ({ page }) => {
        // 既存のリストを作成
        await editor.type('- item1 ');
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');
        await editor.type('item2');
        await page.waitForTimeout(100);
        
        // リストを抜けて段落を作成
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        
        // リストパターンを入力
        await editor.type('- newitem ');
        await page.waitForTimeout(100);
        
        // 結果を確認
        const html = await editor.getHtml();
        
        // 1つのulに3つのliがあることを確認
        const ulCount = (html.match(/<ul>/g) || []).length;
        const liCount = (html.match(/<li>/g) || []).length;
        
        expect(ulCount).toBe(1);
        expect(liCount).toBe(3);
        expect(html).toContain('newitem');
    });
});

test.describe('順序付きリストのマージ', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('順序付きリストの下の段落で「1. 」→ リストの末尾に追加される', async ({ page }) => {
        // 既存の順序付きリストを作成
        await editor.type('1. first ');
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');
        await editor.type('second');
        await page.waitForTimeout(100);
        
        // リストを抜けて段落を作成
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        
        // リストパターンを入力
        await editor.type('1. third ');
        await page.waitForTimeout(100);
        
        // 結果を確認
        const html = await editor.getHtml();
        
        // 1つのolに3つのliがあることを確認
        const olCount = (html.match(/<ol>/g) || []).length;
        const liCount = (html.match(/<li>/g) || []).length;
        
        expect(olCount).toBe(1);
        expect(liCount).toBe(3);
    });
});

test.describe('異なるリスト種類はマージしない', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('順序なしリストの下で「1. 」→ 新しい順序付きリストが作成される', async ({ page }) => {
        // 既存の順序なしリストを作成
        await editor.type('- item1 ');
        await page.waitForTimeout(100);
        await page.keyboard.press('Enter');
        await editor.type('item2');
        await page.waitForTimeout(100);
        
        // リストを抜けて段落を作成
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        
        // 順序付きリストパターンを入力
        await editor.type('1. numbered ');
        await page.waitForTimeout(100);
        
        // 結果を確認
        const html = await editor.getHtml();
        
        // ulとolが別々に存在することを確認
        expect(html).toContain('<ul>');
        expect(html).toContain('<ol>');
    });
});
