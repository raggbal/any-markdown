/**
 * ツールバーリスト変換テスト
 * カーソル行/選択範囲のみの変換、サブリスト保持を検証
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('ツールバーリスト変換: 単一カーソル行のみ変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('ul中間行 → olボタン → 3分割（ul/ol/ul）', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>item1</li><li>item2</li><li>item3</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[1];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ol');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toMatch(/<ul><li>item1<\/li><\/ul>/);
        expect(html).toMatch(/<ol><li>item2<\/li><\/ol>/);
        expect(html).toMatch(/<ul><li>item3<\/li><\/ul>/);
    });

    test('ul中間行 → taskボタン → 同じul内でチェックボックス追加', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>item1</li><li>item2</li><li>item3</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[1];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('task');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // ulは1つのまま
        const ulCount = (html.match(/<ul>/g) || []).length;
        expect(ulCount).toBe(1);
        // item2のみチェックボックスあり
        const lis = await page.$$eval('#editor li', els => els.map(el => ({
            text: el.textContent?.trim(),
            hasCheckbox: !!el.querySelector('input[type="checkbox"]')
        })));
        expect(lis[0].hasCheckbox).toBe(false);
        expect(lis[1].hasCheckbox).toBe(true);
        expect(lis[2].hasCheckbox).toBe(false);
    });

    test('ol中間行 → ulボタン → 3分割（ol/ul/ol）', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>item1</li><li>item2</li><li>item3</li></ol>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[1];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ul');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toMatch(/<ol><li>item1<\/li><\/ol>/);
        expect(html).toMatch(/<ul><li>item2<\/li><\/ul>/);
        expect(html).toMatch(/<ol><li>item3<\/li><\/ol>/);
    });

    test('task中間行 → ulボタン → チェックボックス削除のみ', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox">item1</li><li><input type="checkbox">item2</li><li><input type="checkbox">item3</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[1];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ul');
        });
        await page.waitForTimeout(100);

        const lis = await page.$$eval('#editor li', els => els.map(el => ({
            text: el.textContent?.trim(),
            hasCheckbox: !!el.querySelector('input[type="checkbox"]')
        })));
        expect(lis[0].hasCheckbox).toBe(true);
        expect(lis[1].hasCheckbox).toBe(false);
        expect(lis[2].hasCheckbox).toBe(true);
    });

    test('ul先頭行 → olボタン → 2分割（ol/ul）', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>item1</li><li>item2</li><li>item3</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[0];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ol');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toMatch(/<ol><li>item1<\/li><\/ol>/);
        expect(html).toMatch(/<ul><li>item2<\/li><li>item3<\/li><\/ul>/);
    });

    test('ul末尾行 → olボタン → 2分割（ul/ol）', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>item1</li><li>item2</li><li>item3</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[2];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ol');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toMatch(/<ul><li>item1<\/li><li>item2<\/li><\/ul>/);
        expect(html).toMatch(/<ol><li>item3<\/li><\/ol>/);
    });

    test('単一アイテムのul → olボタン → タグ置換のみ', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>only</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelector('#editor li')!;
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ol');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toMatch(/<ol><li>only<\/li><\/ol>/);
        expect(html).not.toContain('<ul>');
    });

    test('task → olボタン → 3分割（ul(checkbox)/ol/ul(checkbox)）', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox">a</li><li><input type="checkbox">b</li><li><input type="checkbox">c</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[1];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ol');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // item b は ol に変換されチェックボックスなし
        expect(html).toContain('<ol>');
        // item a, c は ul にチェックボックスあり
        const lis = await page.$$eval('#editor li', els => els.map(el => ({
            text: el.textContent?.trim(),
            hasCheckbox: !!el.querySelector('input[type="checkbox"]'),
            parentTag: el.parentElement?.tagName
        })));
        expect(lis.find(l => l.text === 'a')?.hasCheckbox).toBe(true);
        expect(lis.find(l => l.text === 'b')?.hasCheckbox).toBe(false);
        expect(lis.find(l => l.text === 'b')?.parentTag).toBe('OL');
        expect(lis.find(l => l.text === 'c')?.hasCheckbox).toBe(true);
    });
});

test.describe('ツールバーリスト変換: サブリスト保持', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('ulからtaskに変換時、サブリストが保持される', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li>child1</li><li>child2</li></ul></li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const range = document.createRange();
            range.setStart(li.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('task');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        // チェックボックスが追加されていること
        expect(html).toContain('type="checkbox"');
        // サブリストが保持されていること
        expect(html).toContain('child1');
        expect(html).toContain('child2');
        // ネストされたulが存在すること
        const nestedUlCount = (html.match(/<ul>/g) || []).length;
        expect(nestedUlCount).toBeGreaterThanOrEqual(2);
    });

    test('olからtaskに変換時、サブリストが保持される', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>parent<ol><li>sub1</li></ol></li><li>sibling</li></ol>';
        });
        await page.evaluate(() => {
            const li = document.querySelector('#editor > ol > li')!;
            const range = document.createRange();
            range.setStart(li.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('task');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('type="checkbox"');
        expect(html).toContain('sub1');
        expect(html).toContain('sibling');
    });

    test('ulからolに変換時、サブリストが保持される', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li>child</li></ul></li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelector('#editor > ul > li')!;
            const range = document.createRange();
            range.setStart(li.firstChild!, 0);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        await page.evaluate(() => {
            (window as any).__testApi.convertListToType('ol');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('<ol>');
        expect(html).toContain('child');
    });
});

test.describe('ツールバーリスト変換: 非リスト要素の変換', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('段落 → convertToList(ul) → リストに変換', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<p>paragraph text</p>';
        });
        await page.evaluate(() => {
            const p = document.querySelector('#editor p')!;
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        // convertListToType は false を返すので、convertToList にフォールバック
        const result = await page.evaluate(() => {
            return (window as any).__testApi.convertListToType('ul');
        });
        expect(result).toBe(false);

        // フォールバックで convertToList を呼ぶ
        await page.evaluate(() => {
            (window as any).__testApi.convertToList('ul');
        });
        await page.waitForTimeout(100);

        const html = await editor.getHtml();
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>');
        expect(html).toContain('paragraph text');
    });

    test('既に同じタイプの場合は何もしない', async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>item1</li><li>item2</li></ul>';
        });
        await page.evaluate(() => {
            const li = document.querySelectorAll('#editor li')[0];
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });
        const result = await page.evaluate(() => {
            return (window as any).__testApi.convertListToType('ul');
        });
        expect(result).toBe(true);

        const html = await editor.getHtml();
        // 変更なし
        expect(html).toContain('<ul>');
        const ulCount = (html.match(/<ul>/g) || []).length;
        expect(ulCount).toBe(1);
    });
});
