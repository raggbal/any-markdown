/**
 * Shift+Tab テスト：トップレベルで行位置を維持したまま段落化
 *
 * バグ修正: convertListItemToParagraph() がリスト末尾に段落を挿入していた。
 * 修正後: li の位置でリストを分割し、段落をその場に挿入する。
 *
 * バレット・数字・タスクの混合リストで単一行・複数行ともに検証。
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

async function pressShiftTab(page: any) {
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
}

/** エディタ子要素のテキストを視覚順に取得 */
async function getVisualOrder(page: any): Promise<string[]> {
    return page.evaluate(() => {
        const editor = document.getElementById('editor')!;
        const lines: string[] = [];
        function walk(node: Node) {
            if (node.nodeType === 3) {
                const t = node.textContent?.trim();
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

/** 指定テキストを持つ li の先頭にカーソルを置く */
async function setCursorToLi(page: any, text: string) {
    await page.evaluate((t: string) => {
        const lis = document.querySelectorAll('#editor li');
        for (const li of lis) {
            let directText = '';
            for (const child of li.childNodes) {
                if (child.nodeType === 3) directText += child.textContent;
                else if (child.nodeType === 1) {
                    const tag = (child as Element).tagName.toLowerCase();
                    if (tag !== 'ul' && tag !== 'ol' && tag !== 'input' && tag !== 'br')
                        directText += child.textContent;
                }
            }
            if (directText.trim() === t) {
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
                const range = document.createRange();
                range.setStart(li, 0);
                range.collapse(true);
                window.getSelection()!.removeAllRanges();
                window.getSelection()!.addRange(range);
                return;
            }
        }
        throw new Error(`li with text "${t}" not found`);
    }, text);
}

/** bbb から ccc までを範囲選択する */
async function selectFromTo(page: any, fromText: string, toText: string) {
    await page.evaluate(({ from, to }: { from: string; to: string }) => {
        function findTextNode(text: string): Node | null {
            const lis = document.querySelectorAll('#editor li');
            for (const li of lis) {
                for (const child of li.childNodes) {
                    if (child.nodeType === 3 && child.textContent!.trim() === text) return child;
                }
            }
            return null;
        }
        const startNode = findTextNode(from);
        const endNode = findTextNode(to);
        if (!startNode || !endNode) throw new Error(`Node not found: "${from}" or "${to}"`);
        const range = document.createRange();
        range.setStart(startNode, 0);
        range.setEnd(endNode, endNode.textContent!.length);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
    }, { from: fromText, to: toText });
}

test.describe('Shift+Tab トップレベル段落化: 行位置維持', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // ===== 単一行: バレットリスト =====
    test('単一行[バレット]: 中間行をShift+Tab → その場で段落化', async ({ page }) => {
        // - a
        // - b  ← Shift+Tab
        // - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li><li>c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);

        // b が段落になっている
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
        // a と c はリストのまま
        expect(html).toContain('<li>a</li>');
        expect(html).toContain('<li>c</li>');
    });

    test('単一行[バレット]: 先頭行をShift+Tab → 先頭で段落化', async ({ page }) => {
        // - a  ← Shift+Tab
        // - b
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'a');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>a<\/p>/);
        expect(html).toContain('<li>b</li>');
    });

    test('単一行[バレット]: 末尾行をShift+Tab → 末尾で段落化', async ({ page }) => {
        // - a
        // - b  ← Shift+Tab
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
        expect(html).toContain('<li>a</li>');
    });

    // ===== 単一行: 数字リスト =====
    test('単一行[数字]: 中間行をShift+Tab → その場で段落化', async ({ page }) => {
        // 1. a
        // 2. b  ← Shift+Tab
        // 3. c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a</li><li>b</li><li>c</li></ol>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
    });

    // ===== 単一行: タスクリスト =====
    test('単一行[タスク]: 中間行をShift+Tab → その場で段落化', async ({ page }) => {
        // - [ ] a
        // - [ ] b  ← Shift+Tab
        // - [ ] c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"> a</li><li><input type="checkbox"> b</li><li><input type="checkbox"> c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);
        const html = await editor.getHtml();
        expect(html).toContain('<p>');
        expect(html).toContain('b');
    });

    // ===== 単一行: 混合リスト（バレット + 数字） =====
    test('単一行[混合 ul+ol]: バレット行の次に数字行、中間Shift+Tab', async ({ page }) => {
        // - a
        // 1. b  ← Shift+Tab  (同一エディタ内に別リスト)
        // - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li></ul><ol><li>b</li></ol><ul><li>c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        // b は既にトップレベルの独立ol なので Shift+Tab で段落化
        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
    });

    // ===== 単一行: バレット+タスク混在リスト =====
    test('単一行[混合 ul+task]: バレット中間行をShift+Tab', async ({ page }) => {
        // - a
        // - b  ← Shift+Tab
        // - [ ] c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li></ul><ul><li><input type="checkbox"> c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
    });

    // ===== 複数行: バレットリスト =====
    test('複数行[バレット]: 中間2行を選択してShift+Tab → その場で段落化', async ({ page }) => {
        // - a
        // - b  ← 選択開始
        // - c  ← 選択終了
        // - d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);

        const html = await editor.getHtml();
        // b と c が段落になっている
        expect(html).toContain('<p>');
        expect(html).toContain('b');
        expect(html).toContain('c');
        // a と d はリストのまま
        expect(html).toContain('<li>a</li>');
        expect(html).toContain('<li>d</li>');
    });

    test('複数行[バレット]: 先頭2行を選択してShift+Tab', async ({ page }) => {
        // - a  ← 選択開始
        // - b  ← 選択終了
        // - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li><li>c</li></ul>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'a', 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);

        const html = await editor.getHtml();
        expect(html).toContain('a');
        expect(html).toContain('b');
        expect(html).toContain('<li>c</li>');
    });

    // ===== 複数行: 数字リスト =====
    test('複数行[数字]: 中間2行を選択してShift+Tab', async ({ page }) => {
        // 1. a
        // 2. b  ← 選択開始
        // 3. c  ← 選択終了
        // 4. d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a</li><li>b</li><li>c</li><li>d</li></ol>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    // ===== 複数行: タスクリスト =====
    test('複数行[タスク]: 中間2行を選択してShift+Tab', async ({ page }) => {
        // - [ ] a
        // - [ ] b  ← 選択開始
        // - [ ] c  ← 選択終了
        // - [ ] d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"> a</li><li><input type="checkbox"> b</li><li><input type="checkbox"> c</li><li><input type="checkbox"> d</li></ul>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    // ===== 複数行: 混合リスト (ul + ol が並ぶ) =====
    test('複数行[混合 ul→ol]: 末尾ul行と先頭ol行を選択してShift+Tab', async ({ page }) => {
        // - a
        // - b  ← 選択開始
        // 1. c  ← 選択終了
        // 1. d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    // ===== 単一行: 混合リスト 全6パターン（ul/ol/task × 3型） =====

    test('単一行[混合 ul中間→ol後続]: バレット中間行Shift+Tab', async ({ page }) => {
        // - a
        // - b  ← Shift+Tab (ul内)
        // - c
        // 1. d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li><li>c</li></ul><ol><li>d</li></ol>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
    });

    test('単一行[混合 ol中間→ul後続]: 数字中間行Shift+Tab', async ({ page }) => {
        // 1. a
        // 1. b  ← Shift+Tab (ol内)
        // 1. c
        // - d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a</li><li>b</li><li>c</li></ol><ul><li>d</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
    });

    test('単一行[混合 task中間→ol後続]: タスク中間行Shift+Tab', async ({ page }) => {
        // - [ ] a
        // - [ ] b  ← Shift+Tab
        // - [ ] c
        // 1. d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"> a</li><li><input type="checkbox"> b</li><li><input type="checkbox"> c</li></ul><ol><li>d</li></ol>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    test('単一行[混合 ul先頭→task後続]: バレット先頭行Shift+Tab', async ({ page }) => {
        // - a  ← Shift+Tab (ul先頭)
        // - b
        // - [ ] c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li></ul><ul><li><input type="checkbox"> c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'a');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>a<\/p>/);
    });

    test('単一行[混合 ol末尾→task後続]: 数字末尾行Shift+Tab', async ({ page }) => {
        // 1. a
        // 1. b  ← Shift+Tab (ol末尾)
        // - [ ] c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a</li><li>b</li></ol><ul><li><input type="checkbox"> c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c']);
        const html = await editor.getHtml();
        expect(html).toMatch(/<p>b<\/p>/);
    });

    // ===== 複数行: 混合リスト 全パターン =====

    test('複数行[混合 task中間2行→ul後続]: タスク2行Shift+Tab', async ({ page }) => {
        // - [ ] a
        // - [ ] b  ← 選択開始
        // - [ ] c  ← 選択終了
        // - [ ] d
        // - e (別ul)
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"> a</li><li><input type="checkbox"> b</li><li><input type="checkbox"> c</li><li><input type="checkbox"> d</li></ul><ul><li>e</li></ul>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    test('複数行[混合 ul→ol 跨ぎ2行]: 異種リスト跨ぎ2行Shift+Tab', async ({ page }) => {
        // - a
        // - b  ← 選択開始
        // 1. c  ← 選択終了
        // 1. d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    test('複数行[混合 ol→task 跨ぎ2行]: 数字+タスク跨ぎShift+Tab', async ({ page }) => {
        // 1. a
        // 1. b  ← 選択開始
        // - [ ] c  ← 選択終了
        // - [ ] d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ol><li>a</li><li>b</li></ol><ul><li><input type="checkbox"> c</li><li><input type="checkbox"> d</li></ul>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    test('複数行[混合 task→ul 跨ぎ2行]: タスク+バレット跨ぎShift+Tab', async ({ page }) => {
        // - [ ] a
        // - [ ] b  ← 選択開始
        // - c  ← 選択終了
        // - d
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li><input type="checkbox"> a</li><li><input type="checkbox"> b</li></ul><ul><li>c</li><li>d</li></ul>';
        });
        await page.waitForTimeout(100);
        await selectFromTo(page, 'b', 'c');
        await pressShiftTab(page);

        const order = await getVisualOrder(page);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
    });

    // ===== round-trip: Markdown が正しい =====
    test('round-trip[バレット中間行]: Markdown で行位置が維持される', async ({ page }) => {
        // - a
        // - b  ← Shift+Tab
        // - c
        await page.evaluate(() => {
            const editor = document.getElementById('editor')!;
            editor.innerHTML = '<ul><li>a</li><li>b</li><li>c</li></ul>';
        });
        await page.waitForTimeout(100);
        await setCursorToLi(page, 'b');
        await pressShiftTab(page);

        const md = await page.evaluate(() => (window as any).__testApi.getMarkdown());
        const lines = md.split('\n').filter((l: string) => l.trim());

        // a, b, c の順に出現する
        const aIdx = lines.findIndex((l: string) => /^- a$/.test(l.trim()));
        const bIdx = lines.findIndex((l: string) => /^b$/.test(l.trim()));
        const cIdx = lines.findIndex((l: string) => /^- c$/.test(l.trim()));
        expect(aIdx).toBeGreaterThan(-1);
        expect(bIdx).toBeGreaterThan(-1);
        expect(cIdx).toBeGreaterThan(-1);
        expect(aIdx).toBeLessThan(bIdx);
        expect(bIdx).toBeLessThan(cIdx);
        // b にリストマーカーがない
        const bLine = lines[bIdx];
        expect(bLine).not.toMatch(/^[-*+]|^\d+\./);
    });
});
