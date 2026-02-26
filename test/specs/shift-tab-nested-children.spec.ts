/**
 * Shift+Tab テスト：トップレベルのリスト項目にネストされた子リストがある場合
 *
 * 要件 7-8: Shift+Tab on top-level list item → convert to paragraph
 * バグ: convertListItemToParagraph() がネストされた子リスト（ul/ol）を破棄していた
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('Shift+Tab: トップレベルのリスト項目（ネスト子あり）', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('ネスト子リストが独立リストとして保持される', async ({ page }) => {
        // 初期状態:
        // - a       ← カーソル位置
        //   - b
        //   - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // 「a」の先頭にカーソルを置く
        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const textNode = li.childNodes[0]; // "a" テキストノード
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        // Shift+Tab
        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // 「a」が段落になっている
        expect(html).toContain('<p>');
        expect(html).toMatch(/<p>a<\/p>/);

        // bとcがリストとして残っている
        expect(html).toContain('<li>b</li>');
        expect(html).toContain('<li>c</li>');

        // ネストリストがトップレベルのリストになっている（段落の後に配置）
        const topLevelTags = await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            return Array.from(editor.children).map(c => c.tagName.toLowerCase());
        });
        expect(topLevelTags).toContain('p');
        expect(topLevelTags).toContain('ul');
        // 段落が先、リストが後
        const pIndex = topLevelTags.indexOf('p');
        const ulIndex = topLevelTags.indexOf('ul');
        expect(pIndex).toBeLessThan(ulIndex);
    });

    test('複数のネストリスト（ul+ol）が全て保持される', async ({ page }) => {
        // 初期状態:
        // - a       ← カーソル位置
        //   - b
        //   1. c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li></ul><ol><li>c</li></ol></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const textNode = li.childNodes[0];
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // 「a」が段落になっている
        expect(html).toMatch(/<p>a<\/p>/);

        // bとcが残っている
        expect(html).toContain('<li>b</li>');
        expect(html).toContain('<li>c</li>');

        // ulとolが両方残っている
        expect(html).toContain('<ul>');
        expect(html).toContain('<ol>');
    });

    test('リストに他の項目がある場合、それらも保持される', async ({ page }) => {
        // 初期状態:
        // - a       ← カーソル位置
        //   - b
        //   - c
        // - d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const textNode = li.childNodes[0];
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // 「a」が段落になっている
        expect(html).toMatch(/<p>a<\/p>/);

        // b, c, d が全て残っている
        expect(html).toContain('b');
        expect(html).toContain('c');
        expect(html).toContain('d');
    });

    test('空のトップレベルリスト項目にネスト子がある場合', async ({ page }) => {
        // 初期状態:
        // - |       ← 空、カーソル位置
        //   - b
        //   - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><br><ul><li>b</li><li>c</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const range = document.createRange();
            range.setStart(li, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // 段落が作成される
        expect(html).toContain('<p>');

        // bとcがリストとして残っている
        expect(html).toContain('<li>b</li>');
        expect(html).toContain('<li>c</li>');
    });

    test('round-trip: Shift+Tab後のMarkdownが正しい', async ({ page }) => {
        // 初期状態:
        // - a       ← カーソル位置
        //   - b
        //   - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const textNode = li.childNodes[0];
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await page.keyboard.down('Shift');
        await page.keyboard.press('Tab');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(200);

        const md = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });

        // 「a」が段落として出力
        expect(md).toContain('a');
        // bとcがリスト項目として出力
        expect(md).toContain('- b');
        expect(md).toContain('- c');
        // 「a」行にリストマーカーがない
        const lines = md.split('\n').filter((l: string) => l.trim());
        const aLine = lines.find((l: string) => l.includes('a') && !l.includes('b') && !l.includes('c'));
        expect(aLine).toBeDefined();
        expect(aLine).not.toMatch(/^[\s]*[-*+]/);
    });
});
