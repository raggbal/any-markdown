/**
 * Outliner インライン書式・タグ機能テスト
 * Cmd+B/I/E/Shift+S によるマーカー挿入、blur/focus時のレンダリング、タグ検出
 */

import { test, expect } from '@playwright/test';

test.describe('Outliner インライン書式・タグ', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // =========================================================
    // Inline formatting (Cmd+B/I/E/Shift+S)
    // =========================================================

    test('Cmd+B: 選択テキストを ** で囲む（太字）', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'hello world', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        // "world" を選択 (offset 6-11)
        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text') as HTMLElement;
            const range = document.createRange();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            // Skip page icon text nodes if present
            while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
                textNode = walker.nextNode();
            }
            if (textNode) {
                range.setStart(textNode, 6);
                range.setEnd(textNode, 11);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.text).toContain('**world**');
    });

    test('Cmd+I: 選択テキストを * で囲む（斜体）', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'hello world', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text') as HTMLElement;
            const range = document.createRange();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
                textNode = walker.nextNode();
            }
            if (textNode) {
                range.setStart(textNode, 6);
                range.setEnd(textNode, 11);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        await page.keyboard.press('Meta+i');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.text).toContain('*world*');
        // Should not be bold marker
        expect(data.nodes.n1.text).not.toContain('**world**');
    });

    test('Cmd+E: 選択テキストを ` で囲む（インラインコード）', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'hello world', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text') as HTMLElement;
            const range = document.createRange();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
                textNode = walker.nextNode();
            }
            if (textNode) {
                range.setStart(textNode, 6);
                range.setEnd(textNode, 11);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        await page.keyboard.press('Meta+e');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.text).toContain('`world`');
    });

    test('Cmd+Shift+S: 選択テキストを ~~ で囲む（取り消し線）', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'hello world', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text') as HTMLElement;
            const range = document.createRange();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
                textNode = walker.nextNode();
            }
            if (textNode) {
                range.setStart(textNode, 6);
                range.setEnd(textNode, 11);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        await page.keyboard.press('Meta+Shift+s');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.text).toContain('~~world~~');
    });

    test('Cmd+B トグル: 2回目で ** マーカーを除去', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'hello **world**', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        // Select "world" (source offsets 8-13, within ** markers)
        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text') as HTMLElement;
            const range = document.createRange();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
                textNode = walker.nextNode();
            }
            if (textNode) {
                // In edit mode, markers are visible: "hello **world**"
                range.setStart(textNode, 8);
                range.setEnd(textNode, 13);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.text).not.toContain('**');
        expect(data.nodes.n1.text).toContain('world');
    });

    test('書式適用がモデルの text に反映される (lastSyncData)', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'abc def', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        // Select "def"
        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text') as HTMLElement;
            const range = document.createRange();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode = walker.nextNode();
            while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
                textNode = walker.nextNode();
            }
            if (textNode) {
                range.setStart(textNode, 4);
                range.setEnd(textNode, 7);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(1500); // Wait for sync debounce

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.text).toBe('abc **def**');
    });

    // =========================================================
    // Blur-mode rendering
    // =========================================================

    test('**bold** テキスト → blur時に <strong> でレンダリング', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '**bold text**', tags: [] }
                }
            });
        });

        // blur state by default (no focus)
        const strongCount = await page.locator('.outliner-text strong').count();
        expect(strongCount).toBe(1);

        const strongText = await page.locator('.outliner-text strong').first().textContent();
        expect(strongText).toBe('bold text');
    });

    test('*italic* テキスト → blur時に <em> でレンダリング', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '*italic text*', tags: [] }
                }
            });
        });

        const emCount = await page.locator('.outliner-text em').count();
        expect(emCount).toBe(1);
        const emText = await page.locator('.outliner-text em').first().textContent();
        expect(emText).toBe('italic text');
    });

    test('~~strike~~ テキスト → blur時に <del> でレンダリング', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '~~strike text~~', tags: [] }
                }
            });
        });

        const delCount = await page.locator('.outliner-text del').count();
        expect(delCount).toBe(1);
        const delText = await page.locator('.outliner-text del').first().textContent();
        expect(delText).toBe('strike text');
    });

    test('`code` テキスト → blur時に <code> でレンダリング', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '`code text`', tags: [] }
                }
            });
        });

        const codeCount = await page.locator('.outliner-text code').count();
        expect(codeCount).toBe(1);
        const codeText = await page.locator('.outliner-text code').first().textContent();
        expect(codeText).toBe('code text');
    });

    test('混合書式: **bold** と *italic* が同じテキストで正しくレンダリング', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'A **bold** and *italic* mix', tags: [] }
                }
            });
        });

        const strongCount = await page.locator('.outliner-text strong').count();
        const emCount = await page.locator('.outliner-text em').count();
        expect(strongCount).toBe(1);
        expect(emCount).toBe(1);
    });

    // =========================================================
    // Edit-mode rendering
    // =========================================================

    test('フォーカス時はマーカーが生テキストで表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '**bold** text', tags: [] }
                }
            });
        });

        // Before focus: should have <strong>
        expect(await page.locator('.outliner-text strong').count()).toBe(1);

        // Focus the node
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(200);

        // After focus: <strong> should be gone, raw ** markers visible
        expect(await page.locator('.outliner-text strong').count()).toBe(0);
        const content = await textEl.textContent();
        expect(content).toContain('**bold**');
    });

    test('編集モードでもタグはハイライト表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'task #TODO done', tags: ['#TODO'] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(200);

        // Tags should still be highlighted in edit mode
        const tagSpan = page.locator('.outliner-text .outliner-tag');
        expect(await tagSpan.count()).toBeGreaterThanOrEqual(1);
        expect(await tagSpan.first().textContent()).toBe('#TODO');
    });

    // =========================================================
    // Tag detection
    // =========================================================

    test('#tag がハイライト表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Hello #world', tags: ['#world'] }
                }
            });
        });

        const tagSpan = page.locator('.outliner-tag');
        expect(await tagSpan.count()).toBeGreaterThanOrEqual(1);
        expect(await tagSpan.first().textContent()).toBe('#world');
    });

    test('@tag がハイライト表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Assigned @alice', tags: ['@alice'] }
                }
            });
        });

        const tagSpan = page.locator('.outliner-tag');
        expect(await tagSpan.count()).toBeGreaterThanOrEqual(1);
        expect(await tagSpan.first().textContent()).toBe('@alice');
    });

    test('複数タグが同じノード内で検出される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '#urgent @bob #review', tags: ['#urgent', '@bob', '#review'] }
                }
            });
        });

        const tagSpans = page.locator('.outliner-tag');
        expect(await tagSpans.count()).toBe(3);
    });

    test('タグダブルクリック → 検索入力欄にタグが入力される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Task #TODO', tags: ['#TODO'] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Other text', tags: [] }
                }
            });
        });

        // Double-click on the tag span (blur state) to trigger search
        const tagSpan = page.locator('.outliner-tag').first();
        await tagSpan.dblclick();
        await page.waitForTimeout(500);

        const searchInput = page.locator('.outliner-search-input');
        const searchValue = await searchInput.inputValue();
        expect(searchValue).toContain('#TODO');
    });

    // =========================================================
    // Tag space escape (T-5)
    // =========================================================

    test('タグ内でSpace → カーソルがタグ外に移動しスペースが挿入される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '#tag', tags: ['#tag'] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        // Place cursor at end of text (inside tag span in edit mode)
        await page.keyboard.press('End');
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);

        // The text should now have a space after #tag
        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        if (syncData) {
            const data = JSON.parse(syncData);
            expect(data.nodes.n1.text).toContain('#tag ');
        }
    });

    // =========================================================
    // Task nodes
    // =========================================================

    test('checked:false のノード → チェックなしチェックボックスが表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'タスク', tags: [], checked: false }
                }
            });
        });

        const checkbox = page.locator('.outliner-node input[type="checkbox"]');
        expect(await checkbox.count()).toBe(1);
        expect(await checkbox.isChecked()).toBe(false);
    });

    test('チェックボックスクリック → checked状態がトグルされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'タスク', tags: [], checked: false }
                }
            });
        });

        const checkbox = page.locator('.outliner-node input[type="checkbox"]');
        await checkbox.click();
        await page.waitForTimeout(500);

        expect(await checkbox.isChecked()).toBe(true);
    });

    test('チェックボックストグル後にモデルが checked:true になる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'タスク', tags: [], checked: false }
                }
            });
        });

        const checkbox = page.locator('.outliner-node input[type="checkbox"]');
        await checkbox.click();
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncData).not.toBeNull();
        const data = JSON.parse(syncData);
        expect(data.nodes.n1.checked).toBe(true);
    });
});
