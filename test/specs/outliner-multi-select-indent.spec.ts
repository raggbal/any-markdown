import { test, expect } from '@playwright/test';

// Tab/Shift+Tabをプログラムで発火するヘルパー
async function pressTab(page: any, shiftKey = false) {
    await page.evaluate((shift: boolean) => {
        const focused = document.activeElement as HTMLElement;
        if (focused) {
            const event = new KeyboardEvent('keydown', {
                key: 'Tab', code: 'Tab', keyCode: 9,
                shiftKey: shift,
                bubbles: true, cancelable: true
            });
            focused.dispatchEvent(event);
        }
    }, shiftKey);
}

test.describe('Outliner multi-select indent/outdent', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('複数ノード選択+Tabで全ノードがインデントされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2', 'n3'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'node1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'node2', tags: [] },
                    n3: { id: 'n3', parentId: null, children: [], text: 'node3', tags: [] }
                }
            });
        });

        // n2をクリック → Shift+Click n3 で範囲選択
        const n2Text = page.locator('.outliner-text[data-node-id="n2"]');
        await n2Text.click();
        await page.waitForTimeout(200);
        const n3Text = page.locator('.outliner-text[data-node-id="n3"]');
        await n3Text.click({ modifiers: ['Shift'] });
        await page.waitForTimeout(200);

        const selectedCount = await page.locator('.outliner-node.is-selected').count();
        expect(selectedCount).toBeGreaterThanOrEqual(2);

        // Tab を押す（プログラム発火）
        await pressTab(page, false);
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => {
            return (window as any).__testApi.lastSyncData
                ? JSON.parse((window as any).__testApi.lastSyncData)
                : null;
        });

        expect(syncData).not.toBeNull();
        expect(syncData.rootIds).toHaveLength(1);
        expect(syncData.rootIds[0]).toBe('n1');
        const n1 = syncData.nodes['n1'];
        expect(n1.children).toContain('n2');
        expect(n1.children).toContain('n3');
    });

    test('複数ノード選択+Shift+Tabで全ノードがデインデントされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2', 'n3'], text: 'node1', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: 'node2', tags: [] },
                    n3: { id: 'n3', parentId: 'n1', children: [], text: 'node3', tags: [] }
                }
            });
        });

        // n2クリック→Shift+ArrowDown→Shift+Tab (cross-paste testと同じパターン)
        await page.locator('.outliner-text[data-node-id="n2"]').press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => {
            return (window as any).__testApi.lastSyncData
                ? JSON.parse((window as any).__testApi.lastSyncData)
                : null;
        });

        expect(syncData).not.toBeNull();
        expect(syncData.rootIds).toHaveLength(3);
        expect(syncData.nodes['n2'].parentId).toBeNull();
        expect(syncData.nodes['n3'].parentId).toBeNull();
    });

    test('処理後も選択状態が維持される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2', 'n3'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'node1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'node2', tags: [] },
                    n3: { id: 'n3', parentId: null, children: [], text: 'node3', tags: [] }
                }
            });
        });

        const n2Text = page.locator('.outliner-text[data-node-id="n2"]');
        await n2Text.click();
        await page.waitForTimeout(200);
        const n3Text = page.locator('.outliner-text[data-node-id="n3"]');
        await n3Text.click({ modifiers: ['Shift'] });
        await page.waitForTimeout(200);

        const beforeCount = await page.locator('.outliner-node.is-selected').count();
        expect(beforeCount).toBeGreaterThanOrEqual(2);

        await pressTab(page, false);
        await page.waitForTimeout(300);

        const afterCount = await page.locator('.outliner-node.is-selected').count();
        expect(afterCount).toBeGreaterThanOrEqual(2);
    });

    test('複数ノード選択+Tab連続操作ができる', async ({ page }) => {
        // n0をルートに、n1,n2,n3を兄弟として初期化
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n0', 'n1', 'n2'],
                nodes: {
                    n0: { id: 'n0', parentId: null, children: [], text: 'root', tags: [] },
                    n1: { id: 'n1', parentId: null, children: [], text: 'child1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'child2', tags: [] }
                }
            });
        });

        // n1, n2 を選択 (locator.press + keyboard.press パターン)
        await page.locator('.outliner-text[data-node-id="n1"]').press('Shift+ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);

        // 1回目のTab: n1,n2 がn0の子になる
        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);

        // フォーカスがまだ存在し、連続操作可能かテスト
        const focusedAfterFirst = await page.evaluate(() => {
            return document.activeElement?.classList.contains('outliner-text');
        });
        expect(focusedAfterFirst).toBe(true);

        // 選択状態が維持されている
        const selectedAfterFirst = await page.locator('.outliner-node.is-selected').count();
        expect(selectedAfterFirst).toBeGreaterThanOrEqual(2);

        // 1回目のShift+Tab: n1,n2 がn0と同レベルに戻る
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(1500);

        const syncData = await page.evaluate(() => {
            return (window as any).__testApi.lastSyncData
                ? JSON.parse((window as any).__testApi.lastSyncData)
                : null;
        });
        expect(syncData).not.toBeNull();
        // n0, n1, n2 がルートレベルに戻っている
        expect(syncData.rootIds).toHaveLength(3);
    });

    test('単一ノード（選択なし）のTabは既存通り動作する', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'node1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'node2', tags: [] }
                }
            });
        });

        const n2Text = page.locator('.outliner-text[data-node-id="n2"]');
        await n2Text.click();
        await page.waitForTimeout(200);

        // 直接textElにTabイベントを発火
        await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-text[data-node-id="n2"]');
            if (textEl) {
                textEl.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Tab', code: 'Tab', keyCode: 9, which: 9,
                    shiftKey: false, bubbles: true, cancelable: true
                }));
            }
        });
        await page.waitForTimeout(300);

        // DOM構造で検証: n2がn1のchildren container内にあるか
        const n2Parent = await page.evaluate(() => {
            const n2El = document.querySelector('.outliner-node[data-id="n2"]');
            if (!n2El) return null;
            const childrenContainer = n2El.closest('.outliner-children');
            return childrenContainer ? childrenContainer.getAttribute('data-parent') : 'root';
        });

        expect(n2Parent).toBe('n1');
    });
});
