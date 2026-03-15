/**
 * リスト内画像のテスト
 *
 * (1) 画像挿入後に不要な<br>が残らないこと
 * (2) 画像のみの<li>でEnterを押すと新しい兄弟liが作成されること（空判定で画像を見落とさない）
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('リスト内画像: Enter操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('画像のみのリスト項目でEnter → 空の兄弟liが作成される（outdentされない）', async ({ page }) => {
        // 初期状態:
        // - aa
        //   - d
        //   - ![img](test.png)  ← カーソルここ
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>aa<ul><li>d</li><li><img src="test.png" alt="test" style="max-width:100%;"></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // 画像のあるliの末尾にカーソルを設定
        await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul')!;
            const imgLi = nestedUl.querySelectorAll('li')[1]; // 画像のあるli
            const range = document.createRange();
            range.selectNodeContents(imgLi);
            range.collapse(false); // 末尾
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        // Enterを押す
        await editor.press('Enter');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // 画像が残っていること
        expect(html).toContain('<img');
        // ネストされたulの中にliが3つ（d, img, 新しい空li）
        const nestedLiCount = await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul');
            return nestedUl ? nestedUl.querySelectorAll(':scope > li').length : 0;
        });
        expect(nestedLiCount).toBe(3);

        // outdentされていないこと（トップレベルulのliは1つのまま）
        const topLevelLiCount = await page.evaluate(() => {
            const topUl = document.querySelector('#editor > ul');
            return topUl ? topUl.querySelectorAll(':scope > li').length : 0;
        });
        expect(topLevelLiCount).toBe(1);
    });

    test('画像+テキストのリスト項目でEnter → 新しい兄弟liが作成される', async ({ page }) => {
        // - ![img](test.png) some text
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><img src="test.png" alt="test" style="max-width:100%;">some text</li></ul>';
        });
        await page.waitForTimeout(100);

        // liの末尾にカーソル
        await page.evaluate(() => {
            const li = document.querySelector('li')!;
            const textNode = li.lastChild!; // "some text"
            const range = document.createRange();
            range.setStart(textNode, textNode.textContent!.length);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Enter');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        expect(html).toContain('<img');

        const liCount = await page.evaluate(() => {
            return document.querySelectorAll('#editor > ul > li').length;
        });
        expect(liCount).toBe(2);
    });

    test('タスクリスト内の画像のみ項目でEnter → 新しいタスク項目が作成される', async ({ page }) => {
        // - [ ] ![img](test.png)
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"><img src="test.png" alt="test" style="max-width:100%;"></li></ul>';
        });
        await page.waitForTimeout(100);

        // liの末尾にカーソル
        await page.evaluate(() => {
            const li = document.querySelector('li')!;
            const range = document.createRange();
            range.selectNodeContents(li);
            range.collapse(false);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Enter');
        await page.waitForTimeout(200);

        const liCount = await page.evaluate(() => {
            return document.querySelectorAll('#editor > ul > li').length;
        });
        // 画像付きタスクは空ではないので、新しいli追加（outdentではない）
        expect(liCount).toBe(2);
    });
});

test.describe('リスト内画像: Backspace操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('画像のみのネストリスト項目でBackspace先頭 → 空扱いで段落変換されない', async ({ page }) => {
        // - aa
        //   - ![img](test.png)  ← Backspace at beginning
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>aa<ul><li><img src="test.png" alt="test" style="max-width:100%;"></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // ネストli先頭にカーソル
        await page.evaluate(() => {
            const nestedLi = document.querySelector('ul ul li')!;
            const range = document.createRange();
            range.selectNodeContents(nestedLi);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        await editor.press('Backspace');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();
        // 画像が残っていること（空扱いで段落変換されていないこと）
        expect(html).toContain('<img');
    });
});

test.describe('リスト内画像: Tab操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('画像liの次の空liでTab → 画像liの子リストにネストされる', async ({ page }) => {
        // 初期状態:
        // - a
        //   - b
        //   - ![img](test.png)
        //   - |  ← カーソルここ（空li）
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a<ul><li>b</li><li><img src="test.png" alt="test" style="max-width:100%;"></li><li><br></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        // 空liにカーソルを設定
        await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul')!;
            const emptyLi = nestedUl.querySelectorAll(':scope > li')[2]; // 3番目のli（空）
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        // Tab押下
        await editor.press('Tab');
        await page.waitForTimeout(200);

        const html = await editor.getHtml();

        // 画像liの中にネストリストが作成されること
        const structure = await page.evaluate(() => {
            const nestedUl = document.querySelector('ul ul')!;
            const lis = nestedUl.querySelectorAll(':scope > li');
            return {
                nestedLiCount: lis.length,
                // 画像liの子にulがあること
                imgLiHasNestedUl: !!lis[1]?.querySelector(':scope > ul, :scope > ol'),
                // 画像が残っていること
                hasImg: !!nestedUl.querySelector('img')
            };
        });

        // Tab後: ネストulのliは2つ（b, img+nested）
        expect(structure.nestedLiCount).toBe(2);
        expect(structure.imgLiHasNestedUl).toBeTruthy();
        expect(structure.hasImg).toBeTruthy();

        // Markdown変換が正しいこと
        const md = await editor.getMarkdown();
        expect(md).toContain('- a');
        expect(md).toContain('  - b');
        expect(md).toContain('  - ![test](test.png)');
        // ネストされた空項目
        expect(md).toMatch(/    -\s*\n/);
    });
});

test.describe('リスト内画像: 挿入後のDOM状態', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('リスト内に画像挿入後、不要な末尾<br>がないこと', async ({ page }) => {
        // - text| ← ここに画像挿入
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>text</li></ul>';
        });
        await page.waitForTimeout(100);

        // liの末尾にカーソル
        await page.evaluate(() => {
            const li = document.querySelector('li')!;
            const textNode = li.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, textNode.textContent!.length);
            range.collapse(true);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
        });

        // 画像要素を直接挿入（insertImageHtmlメッセージのシミュレーション）
        await page.evaluate(() => {
            const img = document.createElement('img');
            img.src = 'test.png';
            img.alt = 'test';
            img.style.maxWidth = '100%';

            const sel = window.getSelection()!;
            const range = sel.getRangeAt(0);
            range.insertNode(img);
            range.setStartAfter(img);
            range.setEndAfter(img);
            sel.removeAllRanges();
            sel.addRange(range);

            // syncMarkdownをトリガー
            (window as any).__testApi?.syncMarkdown?.();
        });
        await page.waitForTimeout(300);

        // li内の末尾に不要な<br>がないことを確認
        const hasBrAfterImg = await page.evaluate(() => {
            const li = document.querySelector('li')!;
            const img = li.querySelector('img')!;
            const next = img.nextSibling;
            return next && next.nodeName === 'BR';
        });
        // 画像の直後にBRがないことを確認
        expect(hasBrAfterImg).toBeFalsy();
    });
});
