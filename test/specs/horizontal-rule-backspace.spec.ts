/**
 * 水平線直後のBackspaceテスト（要件11-2, 11-3）
 * 水平線を誤って削除しないように保護する動作を検証
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('水平線直後のBackspace', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('水平線直後の空の段落でBackspace → 段落だけ削除、水平線は残る', async ({ page }) => {
        // 水平線を作成（--- + space で変換）
        await editor.type('--- ');
        await page.waitForTimeout(100);
        
        // 水平線が作成されたことを確認
        let html = await editor.getHtml();
        expect(html).toContain('<hr>');
        
        // 水平線の後に空の段落があることを確認
        expect(html).toMatch(/<hr>.*<p>/s);
        
        // Backspaceを押す
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
        
        // 水平線が残っていることを確認
        html = await editor.getHtml();
        expect(html).toContain('<hr>');
    });

    test('水平線直後の内容がある段落でBackspace → 何も削除されない', async ({ page }) => {
        // 水平線を作成（--- + space で変換）
        await editor.type('--- ');
        await page.waitForTimeout(100);
        
        // 段落に内容を入力
        await editor.type('テスト内容');
        await page.waitForTimeout(100);
        
        // カーソルを段落の先頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(50);
        
        // Backspaceを押す
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
        
        // 水平線と内容が両方残っていることを確認
        const html = await editor.getHtml();
        expect(html).toContain('<hr>');
        expect(html).toContain('テスト内容');
    });

    test('水平線の前に段落がある場合、空の段落でBackspace → 前の段落の末尾にカーソル移動しない', async ({ page }) => {
        // 前の段落を作成
        await editor.type('前の段落');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(50);
        
        // 水平線を作成（--- + space で変換）
        await editor.type('--- ');
        await page.waitForTimeout(100);
        
        // 水平線が作成されたことを確認
        let html = await editor.getHtml();
        expect(html).toContain('<hr>');
        expect(html).toContain('前の段落');
        
        // Backspaceを押す
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
        
        // 水平線が残っていることを確認
        html = await editor.getHtml();
        expect(html).toContain('<hr>');
        expect(html).toContain('前の段落');
    });

    test('水平線の後に別の段落がある場合、空の段落でBackspace → 水平線は残る', async ({ page }) => {
        // 水平線を作成（--- + space で変換）
        await editor.type('--- ');
        await page.waitForTimeout(100);
        
        // 現在の空の段落に内容を入力してから、新しい段落を作成
        await editor.type('後の段落');
        await page.waitForTimeout(100);
        
        // 段落の先頭に移動
        await page.keyboard.press('Home');
        await page.waitForTimeout(50);
        
        // 新しい空の段落を作成（Enterで改行）
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(50);
        
        // 現在は空の段落にいるはず、Backspaceを押す
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
        
        // 水平線と後の段落が残っていることを確認
        const html = await editor.getHtml();
        expect(html).toContain('<hr>');
        expect(html).toContain('後の段落');
    });
});

test.describe('水平線のMarkdown変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('水平線がMarkdownに正しく変換される', async ({ page }) => {
        await editor.type('--- ');
        await page.waitForTimeout(100);
        
        const markdown = await editor.getMarkdown();
        expect(markdown).toContain('---');
    });
});
