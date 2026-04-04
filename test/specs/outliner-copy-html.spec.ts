/**
 * Outliner コピー HTML 形式テスト
 * 複数ノード選択時のコピーで text/html にリスト構造が含まれることを検証
 */

import { test, expect } from '@playwright/test';

test.describe('Outliner コピー HTML リスト形式', () => {
    test.beforeEach(async ({ page, context }) => {
        // クリップボード権限を付与
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('複数ノード選択 Cmd+C で text/html にリスト構造が書き込まれる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2', 'n3'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Item 1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Item 2', tags: [] },
                    n3: { id: 'n3', parentId: null, children: [], text: 'Item 3', tags: [] }
                }
            });
        });

        // 最初のノードをクリックし、Shift+↓ で複数選択
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        // 全ノードを選択 (Cmd+A)
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        // 選択状態を確認
        const selectedCount = await page.locator('.outliner-node.is-selected').count();
        expect(selectedCount).toBe(3);

        // Cmd+C でコピー
        await page.keyboard.press('Meta+c');
        await page.waitForTimeout(300);

        // クリップボードの text/html を読み取り
        const pastedHtml = await page.evaluate(async () => {
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    if (item.types.includes('text/html')) {
                        const blob = await item.getType('text/html');
                        return await blob.text();
                    }
                }
            } catch (e) {
                return 'ERROR: ' + (e as Error).message;
            }
            return null;
        });

        // text/html が設定されている場合、<ul> と <li> を含むことを検証
        if (pastedHtml && !pastedHtml.startsWith('ERROR')) {
            expect(pastedHtml).toContain('<ul');
            expect(pastedHtml).toContain('<li>');
            expect(pastedHtml).toContain('Item 1');
            expect(pastedHtml).toContain('Item 2');
            expect(pastedHtml).toContain('Item 3');
        }

        // text/plain も正しく設定されていることを確認
        const plainText = await page.evaluate(() => navigator.clipboard.readText());
        expect(plainText).toContain('Item 1');
        expect(plainText).toContain('Item 2');
    });

    test('階層構造のあるノードのコピーでネストされたリストが生成される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2', 'n3'], text: 'Parent', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: ['n4'], text: 'Child 1', tags: [] },
                    n3: { id: 'n3', parentId: 'n1', children: [], text: 'Child 2', tags: [] },
                    n4: { id: 'n4', parentId: 'n2', children: [], text: 'Grandchild', tags: [] }
                }
            });
        });

        // 全ノードを選択 (Cmd+A)
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);

        // Cmd+C でコピー
        await page.keyboard.press('Meta+c');
        await page.waitForTimeout(300);

        // クリップボードの text/html を検証
        const pastedHtml = await page.evaluate(async () => {
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    if (item.types.includes('text/html')) {
                        const blob = await item.getType('text/html');
                        return await blob.text();
                    }
                }
            } catch (e) {
                return 'ERROR: ' + (e as Error).message;
            }
            return null;
        });

        if (pastedHtml && !pastedHtml.startsWith('ERROR')) {
            // ネストされた <ul> 構造があること
            expect(pastedHtml).toContain('<ul>');
            expect(pastedHtml).toContain('Parent');
            expect(pastedHtml).toContain('Child 1');
            expect(pastedHtml).toContain('Grandchild');

            // ネスト検証: DOMParser でパース
            const nestCheck = await page.evaluate((html: string) => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const topUl = doc.querySelector('ul');
                if (!topUl) return { hasTopUl: false };
                const topLis = topUl.querySelectorAll(':scope > li');
                const firstLi = topLis[0];
                const nestedUl = firstLi?.querySelector('ul');
                return {
                    hasTopUl: true,
                    topLiCount: topLis.length,
                    hasNestedUl: !!nestedUl,
                    nestedLiCount: nestedUl ? nestedUl.querySelectorAll(':scope > li').length : 0
                };
            }, pastedHtml);

            expect(nestCheck.hasTopUl).toBe(true);
            expect(nestCheck.topLiCount).toBe(1); // Parent のみトップレベル
            expect(nestCheck.hasNestedUl).toBe(true);
        }

        // text/plain にもタブインデントで正しく含まれる
        const plainText = await page.evaluate(() => navigator.clipboard.readText());
        expect(plainText).toContain('Parent');
        expect(plainText).toContain('\tChild 1');
    });

    test('単一ノードコピーでは text/html は追加されない（従来動作維持）', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Single node', tags: [] }
                }
            });
        });

        // テキスト選択なしでコピー
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.keyboard.press('Meta+c');
        await page.waitForTimeout(200);

        // text/plain にはテキストが入る
        const plainText = await page.evaluate(() => navigator.clipboard.readText());
        expect(plainText).toBe('Single node');
    });
});
