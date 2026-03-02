/**
 * リスト範囲選択 + Backspace テスト
 *
 * バグ: ネストリストを範囲選択してBackspaceを押すと、テキストは消えるが
 * 空のバレット(<li>)が残ってしまう
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('リスト範囲選択 + Backspace', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('ネストリスト3項目を全選択してBackspace → 空バレットが残らない', async ({ page }) => {
        // 初期状態:
        // - a
        //   - b
        //     - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // "a" の先頭から "c" の末尾まで全選択
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor');
            const topLi = editorEl.querySelector('li');
            const deepestLi = editorEl.querySelector('li li li'); // "c" のli
            const range = document.createRange();
            // "a" の先頭テキストノード
            range.setStart(topLi.firstChild, 0);
            // "c" の末尾
            range.setEnd(deepestLi.firstChild, 1);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        // テキストa,b,cが全て消えていること
        expect(html).not.toContain('>a<');
        expect(html).not.toContain('>b<');
        expect(html).not.toContain('>c<');
        // 空の<li>が複数残っていないこと (最大1つの空liは許容)
        const emptyLiCount = (html.match(/<li><br><\/li>/g) || []).length;
        expect(emptyLiCount).toBeLessThanOrEqual(1);
    });

    test('同階層リスト2項目を範囲選択してBackspace → 空バレットが1つだけ残る', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);

        // "aaa" の先頭から "bbb" の末尾まで選択
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor');
            const lis = editorEl.querySelectorAll('li');
            const range = document.createRange();
            range.setStart(lis[0].firstChild, 0); // "aaa" の先頭
            range.setEnd(lis[1].firstChild, 3);   // "bbb" の末尾
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        // aaa, bbb が消えていること
        expect(html).not.toContain('aaa');
        expect(html).not.toContain('bbb');
        // ccc は残っていること
        expect(html).toContain('ccc');
        // li が2つ以下であること (空1つ + ccc 1つ)
        const liCount = (html.match(/<li>/g) || []).length;
        expect(liCount).toBeLessThanOrEqual(2);
    });

    test('ネストリスト途中の2項目を範囲選択してBackspace → 選択外の項目は維持', async ({ page }) => {
        // 初期状態:
        // - a
        //   - b
        //   - c
        //   - d
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>a<ul><li>b</li><li>c</li><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // "b" の先頭から "c" の末尾まで選択
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor');
            const nestedLis = editorEl.querySelectorAll('ul ul li');
            const range = document.createRange();
            range.setStart(nestedLis[0].firstChild, 0); // "b"
            range.setEnd(nestedLis[1].firstChild, 1);   // "c"
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        // b, c が消えていること
        expect(html).not.toContain('>b<');
        expect(html).not.toContain('>c<');
        // a, d は残っていること
        expect(html).toContain('a');
        expect(html).toContain('d');
    });

    test('単一li内の部分テキスト選択+Backspace → 既存動作が壊れない（回帰テスト）', async ({ page }) => {
        // 初期状態:
        // - hello world
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>hello world</li></ul>';
        });
        await page.waitForTimeout(100);

        // "ello" を選択 (h|ello| world)
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor');
            const li = editorEl.querySelector('li');
            const range = document.createRange();
            range.setStart(li.firstChild, 1);
            range.setEnd(li.firstChild, 5);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        // "h world" が残っていること
        expect(html).toContain('h world');
        // li は1つだけ
        const liCount = (html.match(/<li>/g) || []).length;
        expect(liCount).toBe(1);
    });

    test('ネストリストの上位2項目を範囲選択してBackspace → 下位の子リストが消えない', async ({ page }) => {
        // 初期状態:
        // - ab
        //   - cd
        //     - ef
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>ab<ul><li>cd<ul><li>ef</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // "b" から "d" まで選択 (ab の offset 1 から cd の offset 2)
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor');
            const topLi = editorEl.querySelector('li');            // "ab" の li
            const nestedLi = topLi.querySelector('li');             // "cd" の li
            const range = document.createRange();
            range.setStart(topLi.firstChild, 1);                   // "ab" の offset 1 (after "a")
            range.setEnd(nestedLi.firstChild, 2);                  // "cd" の offset 2 (after "d")
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        // "a" が残っていること
        expect(html).toContain('a');
        // "ef" が残っていること（子リストが消えてはいけない）
        expect(html).toContain('ef');
        // "b", "cd" は消えていること
        expect(html).not.toMatch(/\bab\b/);
        expect(html).not.toMatch(/\bcd\b/);
    });
});
