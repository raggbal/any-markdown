/**
 * Shift+Tab テスト：異種混合リストでの行順序維持
 *
 * 要件 7-7: Shift+Tab on nested list item → outdent (keep line order)
 * バグ: outdentListItem() が異種リスト内でoutdentすると行順序がずれる
 *
 * 原則: Shift+Tabは行の位置を絶対に変えない。インデントレベルだけ変更する。
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

/**
 * ヘルパー: Markdownをセットし、指定テキストを含むliにカーソルを置いてShift+Tab
 */
async function setupMarkdownAndShiftTab(page: any, markdown: string, targetText: string) {
    await page.evaluate((md: string) => {
        (window as any).__testApi.setMarkdown(md);
    }, markdown);
    await page.waitForTimeout(100);

    await page.evaluate((target: string) => {
        const editor = document.getElementById('editor')!;
        const allLis = editor.querySelectorAll('li');
        let targetLi: Element | null = null;
        for (const li of allLis) {
            let directText = '';
            for (const child of li.childNodes) {
                if (child.nodeType === 3) directText += child.textContent || '';
                else if (child.nodeType === 1) {
                    const tag = (child as Element).tagName?.toLowerCase();
                    if (tag !== 'ul' && tag !== 'ol' && tag !== 'input') {
                        directText += child.textContent || '';
                    }
                }
            }
            if (directText.trim() === target) {
                targetLi = li;
                break;
            }
        }
        if (!targetLi) throw new Error(`Li with text "${target}" not found`);

        // Place cursor at start of text
        let textNode: Node | null = null;
        for (const child of targetLi.childNodes) {
            if (child.nodeType === 3 && child.textContent && child.textContent.trim()) {
                textNode = child;
                break;
            }
        }
        const range = document.createRange();
        if (textNode) {
            range.setStart(textNode, 0);
        } else {
            range.setStart(targetLi, 0);
        }
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
    }, targetText);

    await page.waitForTimeout(100);

    // Shift+Tab
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
}

/**
 * ヘルパー: エディタの視覚的な行順序（テキストのみ）を取得
 */
async function getVisualLineOrder(page: any): Promise<string[]> {
    return page.evaluate(() => {
        const editor = document.getElementById('editor')!;
        const lines: string[] = [];

        function walkNode(node: Node) {
            if (node.nodeType === 3) {
                const text = node.textContent?.trim();
                if (text) lines.push(text);
            } else if (node.nodeType === 1) {
                const el = node as Element;
                const tag = el.tagName.toLowerCase();
                if (tag === 'input' || tag === 'br') return;
                for (const child of el.childNodes) {
                    walkNode(child);
                }
            }
        }

        walkNode(editor);
        return lines;
    });
}

/**
 * ヘルパー: Markdownを取得
 */
async function getMarkdown(page: any): Promise<string> {
    return page.evaluate(() => {
        return (window as any).__testApi.getMarkdown();
    });
}

test.describe('Shift+Tab: 異種混合リストでの行順序維持', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // ==============================
    // ユーザー報告ケース
    // ==============================

    test('ユーザー報告: ol内のliをoutdentすると弟リスト(ul)の位置がずれない', async ({ page }) => {
        // 1. a
        // - [ ] b
        //   1. c    ← Shift+Tab
        //     1. d
        //   - e
        await setupMarkdownAndShiftTab(page,
            '1. a\n- [ ] b\n  1. c\n    1. d\n  - e',
            'c');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c', 'd', 'e']);

        const md = await getMarkdown(page);
        // cがbと同レベルに出ている
        expect(md).toContain('- c');
        // dはcの子
        expect(md).toMatch(/- c\n\s+1\. d/);
    });

    // ==============================
    // 異種リスト: 2つのリスト型の全組み合わせ
    // ==============================

    test('ol→ul: olのliをulの親にoutdent', async ({ page }) => {
        // - a
        //   1. b    ← Shift+Tab
        //   1. c
        await setupMarkdownAndShiftTab(page,
            '- a\n  1. b\n  1. c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    test('ul→ol: ulのliをolの親にoutdent', async ({ page }) => {
        // 1. a
        //   - b    ← Shift+Tab
        //   - c
        await setupMarkdownAndShiftTab(page,
            '1. a\n  - b\n  - c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    test('task→ul: タスクリストのliをulにoutdent', async ({ page }) => {
        // - a
        //   - [ ] b    ← Shift+Tab
        //   - [ ] c
        await setupMarkdownAndShiftTab(page,
            '- a\n  - [ ] b\n  - [ ] c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    test('ul→task: ulのliをタスクリストの親にoutdent', async ({ page }) => {
        // - [ ] a
        //   - b    ← Shift+Tab
        //   - c
        await setupMarkdownAndShiftTab(page,
            '- [ ] a\n  - b\n  - c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    test('ol→task: olのliをタスクリストの親にoutdent', async ({ page }) => {
        // - [ ] a
        //   1. b    ← Shift+Tab
        //   1. c
        await setupMarkdownAndShiftTab(page,
            '- [ ] a\n  1. b\n  1. c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    test('task→ol: タスクリストのliをolの親にoutdent', async ({ page }) => {
        // 1. a
        //   - [ ] b    ← Shift+Tab
        //   - [ ] c
        await setupMarkdownAndShiftTab(page,
            '1. a\n  - [ ] b\n  - [ ] c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    // ==============================
    // 後続兄弟リスト（trailingSiblingLists）のパターン
    // ==============================

    test('後続兄弟リスト(ul)がある場合: ol→ulの親でoutdent', async ({ page }) => {
        // - parent
        //   1. a
        //   1. b    ← Shift+Tab
        //   - c     ← parentの子の別ul
        //   - d
        await setupMarkdownAndShiftTab(page,
            '- parent\n  1. a\n  1. b\n  - c\n  - d',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['parent', 'a', 'b', 'c', 'd']);
    });

    test('最初のリスト項目をoutdentしても後続リストの順序維持', async ({ page }) => {
        // - parent
        //   1. a    ← Shift+Tab
        //   - b     ← parentの子の別ul
        await setupMarkdownAndShiftTab(page,
            '- parent\n  1. a\n  - b',
            'a');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['parent', 'a', 'b']);
    });

    test('followingSiblingsとtrailingSiblingListsの両方がある場合', async ({ page }) => {
        // - parent
        //   1. a
        //   1. b    ← Shift+Tab
        //   1. c    ← followingSibling（同じol内）
        //   - d     ← trailingSiblingList（別ul）
        await setupMarkdownAndShiftTab(page,
            '- parent\n  1. a\n  1. b\n  1. c\n  - d',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['parent', 'a', 'b', 'c', 'd']);
    });

    // ==============================
    // grandparentLiの後に兄弟がある場合
    // ==============================

    test('grandparentLiの後に兄弟liがある場合の行順序維持', async ({ page }) => {
        // - a
        //   1. b    ← Shift+Tab
        // - c       ← aの兄弟
        await setupMarkdownAndShiftTab(page,
            '- a\n  1. b\n- c',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c']);
    });

    // ==============================
    // 深いネスト
    // ==============================

    test('深いネスト(level 2→1)での異種リストoutdent', async ({ page }) => {
        // - a
        //   - b
        //     1. c    ← Shift+Tab
        //     1. d
        //   - e
        await setupMarkdownAndShiftTab(page,
            '- a\n  - b\n    1. c\n    1. d\n  - e',
            'c');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    // ==============================
    // followingSiblingsのリスト型維持
    // ==============================

    test('followingSiblingsがol型として維持される', async ({ page }) => {
        // - a
        //   1. b    ← Shift+Tab
        //   1. c    ← followingSibling
        //   1. d    ← followingSibling
        await setupMarkdownAndShiftTab(page,
            '- a\n  1. b\n  1. c\n  1. d',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c', 'd']);

        const md = await getMarkdown(page);
        // c, dがbの子リストとして残っている
        expect(md).toContain('1. c');
        expect(md).toMatch(/\d+\. d/);
    });

    // ==============================
    // 同一型リストでの確認（回帰テスト）
    // ==============================

    test('同一型(ul): followingSiblingsがbの子になる（既存動作）', async ({ page }) => {
        // - a
        //   - b    ← Shift+Tab
        //   - c
        //   - d
        await setupMarkdownAndShiftTab(page,
            '- a\n  - b\n  - c\n  - d',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c', 'd']);
    });

    test('同一型(ol): followingSiblingsがbの子になる（既存動作）', async ({ page }) => {
        // 1. a
        //   1. b    ← Shift+Tab
        //   1. c
        //   1. d
        await setupMarkdownAndShiftTab(page,
            '1. a\n  1. b\n  1. c\n  1. d',
            'b');

        const lines = await getVisualLineOrder(page);
        expect(lines).toEqual(['a', 'b', 'c', 'd']);
    });
});
