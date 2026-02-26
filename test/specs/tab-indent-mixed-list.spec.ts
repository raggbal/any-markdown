/**
 * Tabインデントテスト（混合リスト兄弟がある場合）
 *
 * 問題: 前の兄弟liに異なる型のネストリストが複数ある場合、
 * querySelector('ul, ol')が最初のリストを返すため、
 * Tabインデントで行の位置が変わってしまう。
 *
 * 修正: 最後の子リストに追加するか、同じ型のリストがなければ
 * 末尾に新しいリストを作成して追加する。
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('Tab indent with mixed sibling lists', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // =====================================================
    // ケース1: ul > ol の並びで、ul項目をインデント
    // 前兄弟の子に <ul> と <ol> がある場合、
    // ul項目のTabインデントで位置が変わらないこと
    // =====================================================
    test('ul item after sibling with ul+ol children: Tab should not change visual order', async ({ page }) => {
        // - a
        //   - b
        //     - c      (ul)
        //     1. d     (ol)
        //   - f        ← カーソル here, Tab
        // 期待: f は d の後ろに来る（位置が変わらない）
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul><ol><li>d</li></ol></li><li>f</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // f のliにカーソルを置く
        await page.evaluate(() => {
            const topUl = document.querySelector('#editor > ul')!;
            const aLi = topUl.querySelector(':scope > li')!;
            const nestedUl = aLi.querySelector(':scope > ul')!;
            const fLi = nestedUl.querySelectorAll(':scope > li')[1]; // 2番目 = f
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        // Tabを押す
        await editor.press('Tab');
        await page.waitForTimeout(200);

        // Markdownを取得して位置を確認
        const md = await editor.getMarkdown();
        const lines = md.split('\n').filter(l => l.trim() !== '');

        // f は d の後ろに来るべき
        const dIndex = lines.findIndex(l => l.includes('d'));
        const fIndex = lines.findIndex(l => l.includes('f'));
        expect(fIndex).toBeGreaterThan(dIndex);
        // c は d の前に来るべき
        const cIndex = lines.findIndex(l => l.includes('c'));
        expect(cIndex).toBeLessThan(dIndex);
    });

    // =====================================================
    // ケース2: ol > ul の並びで、ul項目をインデント
    // =====================================================
    test('ul item after sibling with ol+ul children: Tab should not change visual order', async ({ page }) => {
        // - a
        //   - b
        //     1. c     (ol)
        //     - d      (ul)
        //   - f        ← カーソル here, Tab
        // 期待: f は d の後ろ（= 末尾）
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ol><li>c</li></ol><ul><li>d</li></ul></li><li>f</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const topUl = document.querySelector('#editor > ul')!;
            const aLi = topUl.querySelector(':scope > li')!;
            const nestedUl = aLi.querySelector(':scope > ul')!;
            const fLi = nestedUl.querySelectorAll(':scope > li')[1];
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Tab');
        await page.waitForTimeout(200);

        const md = await editor.getMarkdown();
        const lines = md.split('\n').filter(l => l.trim() !== '');
        const cIndex = lines.findIndex(l => l.includes('c'));
        const dIndex = lines.findIndex(l => l.includes('d'));
        const fIndex = lines.findIndex(l => l.includes('f'));
        expect(cIndex).toBeLessThan(dIndex);
        expect(fIndex).toBeGreaterThan(dIndex);
    });

    // =====================================================
    // ケース3: task > ol の並びで、ul項目をインデント
    // =====================================================
    test('ul item after sibling with task+ol children: Tab should not change visual order', async ({ page }) => {
        // - a
        //   - b
        //     - [ ] c   (task ul)
        //     1. d      (ol)
        //   - f         ← Tab
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li><input type="checkbox">c</li></ul><ol><li>d</li></ol></li><li>f</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const topUl = document.querySelector('#editor > ul')!;
            const aLi = topUl.querySelector(':scope > li')!;
            const nestedUl = aLi.querySelector(':scope > ul')!;
            const fLi = nestedUl.querySelectorAll(':scope > li')[1];
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Tab');
        await page.waitForTimeout(200);

        const md = await editor.getMarkdown();
        const lines = md.split('\n').filter(l => l.trim() !== '');
        const dIndex = lines.findIndex(l => l.includes('d'));
        const fIndex = lines.findIndex(l => l.includes('f'));
        expect(fIndex).toBeGreaterThan(dIndex);
    });

    // =====================================================
    // ケース4: ol項目をインデント（前兄弟にul+olあり）
    // =====================================================
    test('ol item after sibling with ul+ol children: Tab should not change visual order', async ({ page }) => {
        // 1. a
        //   1. b
        //     - c       (ul)
        //     1. d      (ol)
        //   1. f        ← Tab
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a<ol><li>b<ul><li>c</li></ul><ol><li>d</li></ol></li><li>f</li></ol></li></ol>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const topOl = document.querySelector('#editor > ol')!;
            const aLi = topOl.querySelector(':scope > li')!;
            const nestedOl = aLi.querySelector(':scope > ol')!;
            const fLi = nestedOl.querySelectorAll(':scope > li')[1];
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Tab');
        await page.waitForTimeout(200);

        const md = await editor.getMarkdown();
        const lines = md.split('\n').filter(l => l.trim() !== '');
        const cIndex = lines.findIndex(l => l.includes('c'));
        const dIndex = lines.findIndex(l => l.includes('d'));
        const fIndex = lines.findIndex(l => l.includes('f'));
        expect(cIndex).toBeLessThan(dIndex);
        expect(fIndex).toBeGreaterThan(dIndex);
    });

    // =====================================================
    // ケース5: 単一のネストリストしかない場合（従来通り動くこと）
    // =====================================================
    test('normal case: single nested list in prev sibling - Tab works as before', async ({ page }) => {
        // - a
        //   - b
        //     - c       (ul only)
        //   - f         ← Tab
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li><li>f</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const topUl = document.querySelector('#editor > ul')!;
            const aLi = topUl.querySelector(':scope > li')!;
            const nestedUl = aLi.querySelector(':scope > ul')!;
            const fLi = nestedUl.querySelectorAll(':scope > li')[1];
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Tab');
        await page.waitForTimeout(200);

        const md = await editor.getMarkdown();
        const lines = md.split('\n').filter(l => l.trim() !== '');
        const cIndex = lines.findIndex(l => l.includes('c'));
        const fIndex = lines.findIndex(l => l.includes('f'));
        // f は c の後に来るべき（同じulに追加されるので）
        expect(fIndex).toBeGreaterThan(cIndex);
    });

    // =====================================================
    // ケース6: 前兄弟にネストリストがない場合（新規作成）
    // =====================================================
    test('normal case: no nested list in prev sibling - creates new list', async ({ page }) => {
        // - a
        //   - b
        //   - f         ← Tab
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li><li>f</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const topUl = document.querySelector('#editor > ul')!;
            const aLi = topUl.querySelector(':scope > li')!;
            const nestedUl = aLi.querySelector(':scope > ul')!;
            const fLi = nestedUl.querySelectorAll(':scope > li')[1];
            const textNode = fLi.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Tab');
        await page.waitForTimeout(200);

        const md = await editor.getMarkdown();
        expect(md).toContain('f');
        // f はインデントされているべき
        const lines = md.split('\n').filter(l => l.trim() !== '');
        const fLine = lines.find(l => l.includes('f'));
        expect(fLine).toBeTruthy();
        // f の行は b の行よりもインデントが深いべき
        const bLine = lines.find(l => l.includes('b'));
        const fIndent = fLine!.match(/^\s*/)?.[0].length || 0;
        const bIndent = bLine!.match(/^\s*/)?.[0].length || 0;
        expect(fIndent).toBeGreaterThan(bIndent);
    });
});
