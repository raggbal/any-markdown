/**
 * Backspace テスト: ネスト li のマージ時に子リストの行順序が崩れないこと
 *
 * バグ: ネストされた最初の li (b) の先頭で Backspace を押すと、
 *       b の子リスト (c) が後続の兄弟 (d) の下に移動してしまう。
 *
 * 修正: b は最初の項目なので c は d より先に来なければならない。
 *       existingNestedList への appendChild → insertBefore(firstChild) に変更。
 *       型が異なる場合は savedNestedList ごと existingNestedList の前に挿入。
 *
 * 原則: 「どんなリスト操作をしても行の位置は絶対に変えない」
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

/** エディタの視覚的な行順序を取得 */
async function getVisualOrder(page: any): Promise<string[]> {
    return page.evaluate(() => {
        const editor = document.getElementById('editor')!;
        const lines: string[] = [];
        function walk(node: Node) {
            if (node.nodeType === 3) {
                const t = (node.textContent || '').trim();
                if (t) lines.push(t);
            } else if (node.nodeType === 1) {
                const el = node as Element;
                const tag = el.tagName.toLowerCase();
                if (tag === 'input' || tag === 'br') return;
                for (const child of el.childNodes) walk(child);
            }
        }
        walk(editor);
        return lines;
    });
}

/** 指定テキストを持つ li の先頭にカーソルを設定 */
async function setCursorToLiStart(page: any, text: string) {
    await page.evaluate((target: string) => {
        const lis = document.querySelectorAll('#editor li');
        for (const li of lis) {
            let directText = '';
            for (const child of li.childNodes) {
                if (child.nodeType === 3) directText += child.textContent;
                else if (child.nodeType === 1) {
                    const tag = (child as Element).tagName.toLowerCase();
                    if (tag !== 'ul' && tag !== 'ol' && tag !== 'input' && tag !== 'br') {
                        directText += child.textContent;
                    }
                }
            }
            if (directText.trim() === target) {
                for (const child of li.childNodes) {
                    if (child.nodeType === 3 && (child.textContent || '').trim()) {
                        const range = document.createRange();
                        range.setStart(child, 0);
                        range.collapse(true);
                        window.getSelection()!.removeAllRanges();
                        window.getSelection()!.addRange(range);
                        return;
                    }
                }
                const range = document.createRange();
                range.setStart(li, 0);
                range.collapse(true);
                window.getSelection()!.removeAllRanges();
                window.getSelection()!.addRange(range);
                return;
            }
        }
        throw new Error(`Li with text "${target}" not found`);
    }, text);
}

test.describe('Backspace: ネスト li マージ時の子リスト行順序保持', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // ===== 基本バグ再現 =====

    test('基本再現: ul内でBackspace → c が d より前に来る', async ({ page }) => {
        // - a
        //   - |b  ← Backspace
        //     - c
        //   - d
        //     - e
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li><li>d<ul><li>e</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd', 'e']);
    });

    test('基本: c に子がある場合も行順序維持', async ({ page }) => {
        // - a
        //   - |b
        //     - c
        //       - c2
        //   - d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c<ul><li>c2</li></ul></li></ul></li><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'c2', 'd']);
    });

    test('b が唯一の項目: c だけが残る', async ({ page }) => {
        // - a
        //   - |b
        //     - c
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c']);
    });

    test('後続が複数: c, d, e の順を維持', async ({ page }) => {
        // - a
        //   - |b
        //     - c
        //   - d
        //   - e
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li><li>d</li><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd', 'e']);
    });

    // ===== 異種混合リスト =====

    test('混在 ul→ol: b(ul) の子 c(ul), 兄弟 d(ol)', async ({ page }) => {
        // - a
        //   - |b   (ul)
        //     - c
        //   1. d   (ol)
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul><ol><li>d</li></ol></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    test('混在 ol→ul: b(ol) の子 c(ol), 兄弟 d(ul)', async ({ page }) => {
        // - a
        //   1. |b  (ol)
        //      1. c
        //   - d    (ul)
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ol><li>b<ol><li>c</li></ol></li></ol><ul><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    test('混在 task→ul: b(task) の子 c(ul), 兄弟 d(ul)', async ({ page }) => {
        // - a
        //   - [ ] |b
        //     - c
        //   - d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li><input type="checkbox"> b<ul><li>c</li></ul></li><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    test('混在 ul→task: b(ul) の子 c(ul), 兄弟 d(task)', async ({ page }) => {
        // - a
        //   - |b
        //     - c
        //   - [ ] d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li><li><input type="checkbox"> d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    test('混在 ol→task: b(ol) の子 c(ol), 兄弟 d(task)', async ({ page }) => {
        // - a
        //   1. |b
        //      1. c
        //   - [ ] d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ol><li>b<ol><li>c</li></ol></li></ol><ul><li><input type="checkbox"> d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    test('混在 task→ol: b(task) の子 c(ul), 兄弟 d(ol)', async ({ page }) => {
        // - a
        //   - [ ] |b
        //     - c
        //   1. d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li><input type="checkbox"> b<ul><li>c</li></ul></li></ul><ol><li>d</li></ol></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    // ===== b の子が別種 =====

    test('b の子が ol, 兄弟 d が同 ul: c(ol) が d(ul) の前に来る', async ({ page }) => {
        // - a
        //   - |b
        //     1. c
        //   - d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ol><li>c</li></ol></li><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'c', 'd']);
    });

    // ===== round-trip検証 =====

    test('round-trip: Backspace後のMarkdownで行順序が正しい', async ({ page }) => {
        // - a
        //   - |b
        //     - c
        //   - d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b<ul><li>c</li></ul></li><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const md = await page.evaluate(() => (window as any).__testApi.getMarkdown());
        const lines = md.split('\n');
        const cIdx = lines.findIndex((l: string) => /^\s*[-*+] c$/.test(l));
        const dIdx = lines.findIndex((l: string) => /^\s*[-*+] d$/.test(l));
        expect(cIdx).toBeGreaterThan(-1);
        expect(dIdx).toBeGreaterThan(-1);
        expect(cIdx).toBeLessThan(dIdx);
    });

    // ===== 回帰テスト（既存動作が壊れていないか） =====

    test('回帰: b が子なし → 普通にマージ', async ({ page }) => {
        // - a
        //   - |b  (子なし)
        //   - d
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b</li><li>d</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab', 'd']);
    });

    test('回帰: b が子なし、兄弟なし → 単純マージ', async ({ page }) => {
        // - a
        //   - |b  (子なし、兄弟なし)
        await page.evaluate(() => {
            const ed = document.getElementById('editor')!;
            ed.innerHTML = '<ul><li>a<ul><li>b</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLiStart(page, 'b');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['ab']);
    });
});
