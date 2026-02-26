/**
 * Shift+Tab テスト: 異種混合リストでの行順序保持
 *
 * バグ: outdentListItem() が parentList の後にある兄弟リスト（trailing sibling lists）を
 * 収集しないため、異種リスト混在時に行順序がずれる。
 *
 * 原則: 「どんなときも行の位置は決して変えない」
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

/** エディタのトップレベル子要素からテキストを順序通りに取得するヘルパー */
async function getVisualLineOrder(page: any): Promise<string[]> {
    return await page.evaluate(() => {
        const editor = document.getElementById('editor')!;
        const lines: string[] = [];
        function walk(el: Element) {
            if (el.tagName === 'LI') {
                // checkbox付きの場合はテキストだけ
                let text = '';
                for (const child of el.childNodes) {
                    if (child.nodeType === 3) text += child.textContent;
                    else if (child.nodeType === 1) {
                        const tag = (child as Element).tagName.toLowerCase();
                        if (tag !== 'ul' && tag !== 'ol' && tag !== 'input' && tag !== 'br') {
                            text += child.textContent;
                        }
                    }
                }
                text = text.trim();
                if (text) lines.push(text);
                // recurse into nested lists
                for (const child of el.children) {
                    const tag = child.tagName.toLowerCase();
                    if (tag === 'ul' || tag === 'ol') walk(child);
                }
            } else if (el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2') {
                const text = el.textContent?.trim();
                if (text) lines.push(text);
            } else if (el.tagName === 'UL' || el.tagName === 'OL') {
                for (const child of el.children) walk(child);
            }
        }
        for (const child of editor.children) walk(child);
        return lines;
    });
}

/** 指定テキストのli要素の先頭にカーソルを設定 */
async function setCursorToLiWithText(page: any, text: string) {
    await page.evaluate((targetText: string) => {
        const lis = document.querySelectorAll('#editor li');
        for (const li of lis) {
            // li直接のテキストだけ見る（ネストリストのテキストは除外）
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
            if (directText.trim() === targetText) {
                // テキストノードの先頭にカーソル
                for (const child of li.childNodes) {
                    if (child.nodeType === 3 && child.textContent!.trim()) {
                        const range = document.createRange();
                        range.setStart(child, 0);
                        range.collapse(true);
                        window.getSelection()!.removeAllRanges();
                        window.getSelection()!.addRange(range);
                        return;
                    }
                }
                // テキストノードがない場合はliの先頭
                const range = document.createRange();
                range.setStart(li, 0);
                range.collapse(true);
                window.getSelection()!.removeAllRanges();
                window.getSelection()!.addRange(range);
                return;
            }
        }
        throw new Error('Li with text "' + targetText + '" not found');
    }, text);
}

async function pressShiftTab(page: any) {
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
}

test.describe('Shift+Tab: 異種混合リストでの行順序保持', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // ===== 報告されたバグの再現 =====
    test('報告バグ再現: ol項目のShift+Tabで後続ulの行順序がずれない', async ({ page }) => {
        // - [ ] b
        //   1. c  ← Shift+Tab
        //     1. d
        //   - e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"> b<ol><li>c<ol><li>d</li></ol></li></ol><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['b', 'c', 'd', 'e']);
    });

    // ===== 全兄弟パターン: 数字 > バレット =====
    test('数字 > バレット: ol項目の後にul兄弟', async ({ page }) => {
        // - parent
        //   1. c  ← Shift+Tab
        //   - e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ol><li>c</li></ol><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e']);
    });

    // ===== バレット > 数字 =====
    test('バレット > 数字: ul項目の後にol兄弟', async ({ page }) => {
        // - parent
        //   - c  ← Shift+Tab
        //   1. e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li>c</li></ul><ol><li>e</li></ol></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e']);
    });

    // ===== タスク > バレット =====
    test('タスク > バレット: タスク項目の後にul兄弟', async ({ page }) => {
        // - parent
        //   - [ ] c  ← Shift+Tab
        //   - e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li><input type="checkbox"> c</li></ul><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e']);
    });

    // ===== タスク > 数字 =====
    test('タスク > 数字: タスク項目の後にol兄弟', async ({ page }) => {
        // - parent
        //   - [ ] c  ← Shift+Tab
        //   1. e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li><input type="checkbox"> c</li></ul><ol><li>e</li></ol></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e']);
    });

    // ===== 数字 > タスク =====
    test('数字 > タスク: ol項目の後にタスクul兄弟', async ({ page }) => {
        // - parent
        //   1. c  ← Shift+Tab
        //   - [ ] e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ol><li>c</li></ol><ul><li><input type="checkbox"> e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e']);
    });

    // ===== バレット > タスク =====
    test('バレット > タスク: ul項目の後にタスクul兄弟', async ({ page }) => {
        // - parent
        //   - c  ← Shift+Tab
        //   - [ ] e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li>c</li></ul><ul><li><input type="checkbox"> e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e']);
    });

    // ===== 複数の trailing sibling lists =====
    test('複数の trailing: ol + ul + ol が全て行順序を維持', async ({ page }) => {
        // - parent
        //   1. c  ← Shift+Tab
        //   - e
        //   1. f
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ol><li>c</li></ol><ul><li>e</li></ul><ol><li>f</li></ol></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'e', 'f']);
    });

    // ===== following siblings + trailing sibling lists =====
    test('following siblings + trailing: 同リスト内弟 + 後続兄弟リスト', async ({ page }) => {
        // - parent
        //   1. c  ← Shift+Tab
        //   2. d  (following sibling in same ol)
        //   - e   (trailing sibling list)
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ol><li>c</li><li>d</li></ol><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'd', 'e']);
    });

    // ===== 子リスト付き + trailing =====
    test('子リスト付き項目 + trailing: 子も trailing も行順序維持', async ({ page }) => {
        // - parent
        //   1. c  ← Shift+Tab
        //     1. d (child of c)
        //   - e   (trailing sibling list)
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ol><li>c<ol><li>d</li></ol></li></ol><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        expect(order).toEqual(['parent', 'c', 'd', 'e']);
    });

    // ===== trailing が parentList より前にある兄弟は移動しない =====
    test('parentListの前の兄弟リストは移動しない', async ({ page }) => {
        // - parent
        //   - x   (parentList の前の ul)
        //   1. c  ← Shift+Tab
        //   - e   (parentList の後の ul)
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ul><li>x</li></ul><ol><li>c</li></ol><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const order = await getVisualLineOrder(page);
        // x は parent の子のまま、c の前の位置で保持
        // 期待: parent, x, c, e
        expect(order).toEqual(['parent', 'x', 'c', 'e']);
    });

    // ===== round-trip検証 =====
    test('round-trip: Shift+Tab後のMarkdownで行順序が正しい', async ({ page }) => {
        // - parent
        //   1. c  ← Shift+Tab
        //   - e
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>parent<ol><li>c</li></ol><ul><li>e</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);

        await setCursorToLiWithText(page, 'c');
        await pressShiftTab(page);

        const md = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });

        // c と e が正しい順序で出力される
        // "parent" 内の文字に誤マッチしないよう、行単位で検索
        const lines = md.split('\n');
        const cLineIdx = lines.findIndex((l: string) => /^\s*[-*+\d.]* ?c$/.test(l.trim()));
        const eLineIdx = lines.findIndex((l: string) => /^\s*[-*+\d.]* ?e$/.test(l.trim()));
        expect(cLineIdx).toBeGreaterThan(-1);
        expect(eLineIdx).toBeGreaterThan(-1);
        expect(cLineIdx).toBeLessThan(eLineIdx);
    });
});
