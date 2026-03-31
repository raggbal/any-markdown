/**
 * Outliner 基本テスト
 * 初期化、ノード追加、編集、キー操作の基盤テスト
 */

import { test, expect } from '@playwright/test';

test.describe('Outliner 基本テスト', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // --- 初期化 ---

    test('空データで初期化できる', async ({ page }) => {
        const treeVisible = await page.locator('.outliner-tree').isVisible();
        expect(treeVisible).toBe(true);
    });

    test('ノード付きデータで初期化できる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'ノード1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'ノード2', tags: [] }
                }
            });
        });

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);

        const firstText = await page.locator('.outliner-node').first().locator('.outliner-text').textContent();
        expect(firstText).toContain('ノード1');
    });

    // --- ノード編集 ---

    test('ノードのテキストを編集して syncData が呼ばれる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'テスト', tags: [] }
                }
            });
        });

        // テキスト要素をクリックしてフォーカス
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();

        // テキストを追加入力
        await page.keyboard.type('追加');

        // syncData のデバウンスを待つ
        await page.waitForTimeout(1500);

        const lastSync = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(lastSync).not.toBeNull();

        const data = JSON.parse(lastSync);
        expect(data.nodes.n1.text).toContain('追加');
    });

    // --- Enter でノード追加 ---

    test('Enter で新しいノードが追加される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'ノード1', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();

        // テキスト末尾にカーソルを移動してEnter
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');

        await page.waitForTimeout(200);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);
    });

    // --- Backspace でノード削除 ---

    test('空ノードの先頭で Backspace → ノード削除', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'ノード1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        // 2番目の空ノードにフォーカス
        const secondText = page.locator('.outliner-node .outliner-text').nth(1);
        await secondText.click();

        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(1);
    });

    // --- Tab でインデント ---

    test('Tab でノードがインデントされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'ノード1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'ノード2', tags: [] }
                }
            });
        });

        // 2番目のノードにフォーカス
        const secondText = page.locator('.outliner-node .outliner-text').nth(1);
        await secondText.click();

        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        // n2 が n1 の子になっている（.outliner-children は .outliner-node の兄弟要素）
        const nestedNodeCount = await page.locator('.outliner-children .outliner-node').count();
        expect(nestedNodeCount).toBe(1);
    });

    // --- Shift+Tab でアウトデント ---

    test('Shift+Tab でノードがアウトデントされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: 'ノード1', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: 'ノード2', tags: [] }
                }
            });
        });

        // ネストされたノードにフォーカス
        const nestedText = page.locator('.outliner-children .outliner-text').first();
        await nestedText.click();

        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        // n2 がトップレベルに戻っている
        const topLevelCount = await page.locator('.outliner-tree > .outliner-node').count();
        expect(topLevelCount).toBe(2);
    });

    // --- 折りたたみ ---

    test('バレットクリックで子ノードが折りたたまれる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: '親ノード', tags: [], collapsed: false },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: '子ノード', tags: [] }
                }
            });
        });

        // 子ノードが表示されていることを確認
        const childBefore = await page.locator('.outliner-children .outliner-node').count();
        expect(childBefore).toBe(1);

        // バレットをクリック（.outliner-bullet は .outliner-node の直接子要素）
        const bullet = page.locator('.outliner-tree > .outliner-node > .outliner-bullet').first();
        await bullet.click();
        await page.waitForTimeout(300);

        // 折りたたみ後の状態を確認
        const childrenVisible = await page.evaluate(() => {
            const children = document.querySelector('.outliner-children');
            if (!children) return false;
            return children.getBoundingClientRect().height > 0;
        });
        expect(childrenVisible).toBe(false);
    });

    // --- タグ検出 ---

    test('テキスト内の #tag が検出される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'タスク #TODO 完了', tags: ['#TODO'] }
                }
            });
        });

        // タグがハイライト表示されている（blur状態ではrenderInlineTextでタグspan生成）
        const tagSpan = page.locator('.outliner-tag');
        const tagCount = await tagSpan.count();
        expect(tagCount).toBeGreaterThanOrEqual(1);
    });

    // --- ↑↓ ナビゲーション ---

    test('↑↓ でノード間を移動できる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2', 'n3'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '1行目', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: '2行目', tags: [] },
                    n3: { id: 'n3', parentId: null, children: [], text: '3行目', tags: [] }
                }
            });
        });

        // 1行目にフォーカス
        const firstText = page.locator('.outliner-node .outliner-text').first();
        await firstText.click();
        await page.waitForTimeout(100);

        // ↓ で2行目へ
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);

        // フォーカスされたノードのテキストを確認
        const focusedNodeId = await page.evaluate(() => {
            const focused = document.querySelector('.outliner-node.is-focused');
            return focused ? focused.getAttribute('data-id') : null;
        });
        // n1 から n2 に移動しているはず
        expect(focusedNodeId).not.toBe('n1');
    });

    // --- Undo/Redo ---

    test('Cmd+Z で undo できる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '元テキスト', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('追加');
        await page.waitForTimeout(200);

        // Undo
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        const text = await textEl.textContent();
        expect(text).not.toContain('追加');
    });

    // --- 検索 ---

    test('検索でノードがフィルタされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2', 'n3'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'りんご', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'みかん', tags: [] },
                    n3: { id: 'n3', parentId: null, children: [], text: 'りんごジュース', tags: [] }
                }
            });
        });

        // 検索バーに入力
        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await searchInput.fill('りんご');

        // 検索結果の反映を待つ
        await page.waitForTimeout(500);

        // マッチしないノードが非表示
        const visibleNodes = await page.locator('.outliner-node:not([style*="display: none"])').count();
        expect(visibleNodes).toBe(2);
    });
});
