import { test, expect } from '@playwright/test';

test.describe('Outliner Backspace on empty node with children', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('empty node with children: Backspace promotes children to same level', async ({ page }) => {
        // Setup: a, empty (with children b, c)
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['a', 'empty'],
                nodes: {
                    a: { id: 'a', parentId: null, children: [], text: 'aaa', tags: [] },
                    empty: { id: 'empty', parentId: null, children: ['b', 'c'], text: '', tags: [] },
                    b: { id: 'b', parentId: 'empty', children: [], text: 'bbb', tags: [] },
                    c: { id: 'c', parentId: 'empty', children: [], text: 'ccc', tags: [] }
                }
            });
        });

        // Focus the empty node and press Backspace
        await page.locator('.outliner-text[data-node-id="empty"]').press('Backspace');
        await page.waitForTimeout(300);

        // Wait for sync
        await page.waitForTimeout(1500);
        const syncData = await page.evaluate(() => {
            const s = (window as any).__testApi.lastSyncData;
            return s ? JSON.parse(s) : null;
        });

        // empty node should be removed
        expect(syncData.nodes.empty).toBeUndefined();

        // b and c should be at root level (same position as empty was)
        expect(syncData.rootIds).toEqual(['a', 'b', 'c']);

        // b and c should have no parent (root level)
        expect(syncData.nodes.b.parentId).toBeNull();
        expect(syncData.nodes.c.parentId).toBeNull();

        // Cursor should be at end of 'aaa'
        const focusedId = await page.evaluate(() => {
            const el = document.querySelector('.outliner-node.is-focused');
            return el?.getAttribute('data-id');
        });
        expect(focusedId).toBe('a');
    });

    test('empty nested node with children: Backspace promotes children to parent level', async ({ page }) => {
        // Setup: parent > (empty (with children b, c), d)
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['parent'],
                nodes: {
                    parent: { id: 'parent', parentId: null, children: ['empty', 'd'], text: 'parent', tags: [] },
                    empty: { id: 'empty', parentId: 'parent', children: ['b', 'c'], text: '', tags: [] },
                    b: { id: 'b', parentId: 'empty', children: [], text: 'bbb', tags: [] },
                    c: { id: 'c', parentId: 'empty', children: [], text: 'ccc', tags: [] },
                    d: { id: 'd', parentId: 'parent', children: [], text: 'ddd', tags: [] }
                }
            });
        });

        await page.locator('.outliner-text[data-node-id="empty"]').press('Backspace');
        await page.waitForTimeout(300);

        await page.waitForTimeout(1500);
        const syncData = await page.evaluate(() => {
            const s = (window as any).__testApi.lastSyncData;
            return s ? JSON.parse(s) : null;
        });

        // empty removed, b and c promoted to parent's children at empty's position
        expect(syncData.nodes.empty).toBeUndefined();
        expect(syncData.nodes.parent.children).toEqual(['b', 'c', 'd']);
        expect(syncData.nodes.b.parentId).toBe('parent');
        expect(syncData.nodes.c.parentId).toBe('parent');
    });

    test('empty node with children: visual order preserved (a, b, c)', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['a', 'empty'],
                nodes: {
                    a: { id: 'a', parentId: null, children: [], text: 'aaa', tags: [] },
                    empty: { id: 'empty', parentId: null, children: ['b', 'c'], text: '', tags: [] },
                    b: { id: 'b', parentId: 'empty', children: [], text: 'bbb', tags: [] },
                    c: { id: 'c', parentId: 'empty', children: [], text: 'ccc', tags: [] }
                }
            });
        });

        await page.locator('.outliner-text[data-node-id="empty"]').press('Backspace');
        await page.waitForTimeout(500);

        // Check visual order: a, b, c
        const texts = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.outliner-text'))
                .filter(el => (el as HTMLElement).offsetParent !== null)
                .map(el => el.textContent?.trim());
        });
        expect(texts).toEqual(['aaa', 'bbb', 'ccc']);
    });
});
