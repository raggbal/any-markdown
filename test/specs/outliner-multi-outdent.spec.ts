import { test, expect } from '@playwright/test';

test.describe('Outliner multi-select Shift+Tab (outdent)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('multi-select outdent preserves relative hierarchy', async ({ page }) => {
        // - a
        //     - b
        //          - c
        //     - d
        //          - e
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['a'],
                nodes: {
                    a: { id: 'a', parentId: null, children: ['b', 'd'], text: 'aaa', tags: [] },
                    b: { id: 'b', parentId: 'a', children: ['c'], text: 'bbb', tags: [] },
                    c: { id: 'c', parentId: 'b', children: [], text: 'ccc', tags: [] },
                    d: { id: 'd', parentId: 'a', children: ['e'], text: 'ddd', tags: [] },
                    e: { id: 'e', parentId: 'd', children: [], text: 'eee', tags: [] }
                }
            });
        });

        // Select b, c, d, e and press Shift+Tab via Outliner API
        await page.evaluate(() => {
            const Outliner = (window as any).Outliner;
            // Programmatically select b through e
            const textEl = document.querySelector('.outliner-text[data-node-id="b"]') as HTMLElement;
            textEl.focus();
        });
        await page.waitForTimeout(200);

        // Use Shift+ArrowDown to select (playwright keyboard)
        await page.locator('.outliner-text[data-node-id="b"]').press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);

        const selectedCount = await page.locator('.outliner-node.is-selected').count();
        expect(selectedCount).toBe(4);

        // Shift+Tab via keyboard
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(2000);

        const syncData = await page.evaluate(() => {
            const s = (window as any).__testApi.lastSyncData;
            return s ? JSON.parse(s) : null;
        });

        // Expected: a, b (with child c), d (with child e) — all at root
        expect(syncData).not.toBeNull();
        expect(syncData.rootIds).toEqual(['a', 'b', 'd']);
        expect(syncData.nodes.b.parentId).toBeNull();
        expect(syncData.nodes.b.children).toEqual(['c']);
        expect(syncData.nodes.c.parentId).toBe('b');
        expect(syncData.nodes.d.parentId).toBeNull();
        expect(syncData.nodes.d.children).toEqual(['e']);
        expect(syncData.nodes.e.parentId).toBe('d');
    });

    test('visual order after multi-select outdent: a, b, c, d, e', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['a'],
                nodes: {
                    a: { id: 'a', parentId: null, children: ['b', 'd'], text: 'aaa', tags: [] },
                    b: { id: 'b', parentId: 'a', children: ['c'], text: 'bbb', tags: [] },
                    c: { id: 'c', parentId: 'b', children: [], text: 'ccc', tags: [] },
                    d: { id: 'd', parentId: 'a', children: ['e'], text: 'ddd', tags: [] },
                    e: { id: 'e', parentId: 'd', children: [], text: 'eee', tags: [] }
                }
            });
        });

        await page.locator('.outliner-text[data-node-id="b"]').press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);

        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(500);

        const texts = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.outliner-text'))
                .filter(el => (el as HTMLElement).offsetParent !== null)
                .map(el => el.textContent?.trim());
        });
        expect(texts).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee']);
    });
});
