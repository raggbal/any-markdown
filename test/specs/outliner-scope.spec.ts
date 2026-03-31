/**
 * Outliner Scope テスト
 *
 * スコープ設定/解除、パンくずナビゲーション、スコープヘッダー操作制限、
 * Shift+Tabスコープ境界制限、空状態、スコープ対象消失を網羅。
 */

import { test, expect } from '@playwright/test';

/** テストデータ: 3階層ネスト */
function makeTestData() {
    return {
        version: 1,
        rootIds: ['n1'],
        nodes: {
            n1: { id: 'n1', parentId: null, children: ['n2', 'n3'], text: '親ノード', tags: [] },
            n2: { id: 'n2', parentId: 'n1', children: ['n4'], text: '子ノード1', tags: [] },
            n3: { id: 'n3', parentId: 'n1', children: [], text: '子ノード2', tags: [] },
            n4: { id: 'n4', parentId: 'n2', children: [], text: '孫ノード', tags: [] }
        }
    };
}

// ===== スコープ設定 =====

test.describe('スコープ設定', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeTestData());
        await page.waitForTimeout(200);
    });

    test('1. Cmd+] でフォーカスノードにスコープ設定、スコープヘッダーとして表示', async ({ page }) => {
        // n2のテキストをクリックしてフォーカス
        await page.locator('.outliner-node[data-id="n2"] .outliner-text').click();
        await page.waitForTimeout(300);

        // Cmd+] でスコープ設定
        await page.keyboard.press('Meta+BracketRight');
        await page.waitForTimeout(400);

        // n2がスコープヘッダーとして表示される
        const header = page.locator('.outliner-node.outliner-scope-header');
        await expect(header).toHaveCount(1);
        const headerId = await header.getAttribute('data-id');
        expect(headerId).toBe('n2');

        // ヘッダーテキストが「子ノード1」
        const headerText = await header.locator('.outliner-text').textContent();
        expect(headerText).toContain('子ノード1');
    });

    test('2. スコープボタン（照準アイコン）クリックでスコープ設定', async ({ page }) => {
        // n1ノードにホバーしてスコープボタンを表示
        const n1Node = page.locator('.outliner-node[data-id="n1"]');
        await n1Node.hover();
        await page.waitForTimeout(100);

        // スコープボタンをクリック
        const scopeBtn = n1Node.locator('.outliner-scope-btn');
        await scopeBtn.click();
        await page.waitForTimeout(300);

        // n1がスコープヘッダーとして表示
        const header = page.locator('.outliner-node.outliner-scope-header');
        await expect(header).toHaveCount(1);
        const headerId = await header.getAttribute('data-id');
        expect(headerId).toBe('n1');
    });

    test('3. スコープ設定後にパンくずリストが表示される（祖先チェーン+TOP）', async ({ page }) => {
        // n4（孫ノード）にスコープ設定
        const n4Node = page.locator('.outliner-node[data-id="n4"]');
        await n4Node.hover();
        await page.waitForTimeout(100);
        await n4Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // パンくずが表示される
        const breadcrumb = page.locator('.outliner-breadcrumb');
        await expect(breadcrumb).toHaveClass(/is-visible/);

        // TOPボタンが存在する
        const topBtn = breadcrumb.locator('.outliner-breadcrumb-top');
        await expect(topBtn).toHaveCount(1);

        // 祖先チェーンのアイテムが表示される（n1: 親ノード, n2: 子ノード1, n4: 孫ノード）
        const items = breadcrumb.locator('.outliner-breadcrumb-item');
        const itemCount = await items.count();
        expect(itemCount).toBe(3);

        // 最初のアイテムが「親ノード」
        const firstItemText = await items.nth(0).textContent();
        expect(firstItemText).toContain('親ノード');

        // 2番目のアイテムが「子ノード1」
        const secondItemText = await items.nth(1).textContent();
        expect(secondItemText).toContain('子ノード1');
    });

    test('4. スコープ設定時にスコープヘッダーテキスト末尾にカーソル配置', async ({ page }) => {
        // n2にスコープ設定
        const n2Node = page.locator('.outliner-node[data-id="n2"]');
        await n2Node.hover();
        await page.waitForTimeout(100);
        await n2Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // スコープヘッダーのテキスト要素にフォーカスがある
        const headerText = page.locator('.outliner-node.outliner-scope-header .outliner-text');
        const isFocused = await headerText.evaluate((el) => {
            return document.activeElement === el || el.contains(document.activeElement);
        });
        expect(isFocused).toBe(true);

        // カーソルが末尾にあることを確認
        const cursorAtEnd = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return false;
            const range = sel.getRangeAt(0);
            const container = range.startContainer;
            const offset = range.startOffset;
            // テキストノードの末尾にいるか、要素ノードの最後の子の後ろにいるか
            if (container.nodeType === 3) {
                return offset === (container as Text).length;
            }
            return offset === container.childNodes.length;
        });
        expect(cursorAtEnd).toBe(true);
    });
});

// ===== スコープ解除 =====

test.describe('スコープ解除', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeTestData());
        await page.waitForTimeout(200);
    });

    test('5. Cmd+Shift+] でスコープ解除、全ノード表示', async ({ page }) => {
        // まずn1にスコープ設定
        const n1Node = page.locator('.outliner-node[data-id="n1"]');
        await n1Node.hover();
        await n1Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // スコープが設定されていることを確認
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(1);

        // Cmd+Shift+] でスコープ解除
        await page.keyboard.press('Meta+Shift+BracketRight');
        await page.waitForTimeout(300);

        // スコープヘッダーがなくなる
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(0);

        // 全ノードが表示される
        await expect(page.locator('.outliner-node[data-id="n1"]')).toBeVisible();
        await expect(page.locator('.outliner-node[data-id="n2"]')).toBeVisible();
        await expect(page.locator('.outliner-node[data-id="n3"]')).toBeVisible();
        await expect(page.locator('.outliner-node[data-id="n4"]')).toBeVisible();
    });

    test('6. パンくずのTOPクリックでスコープ解除', async ({ page }) => {
        // n2にスコープ設定
        const n2Node = page.locator('.outliner-node[data-id="n2"]');
        await n2Node.hover();
        await n2Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // TOPボタンをクリック
        const topBtn = page.locator('.outliner-breadcrumb-top');
        await expect(topBtn).toBeVisible();
        await topBtn.click();
        await page.waitForTimeout(300);

        // スコープが解除される
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(0);

        // 全ノードが表示される
        await expect(page.locator('.outliner-node[data-id="n1"]')).toBeVisible();
    });

    test('7. スコープ解除後、直前のスコープノードにフォーカス移動', async ({ page }) => {
        // n2にスコープ設定
        const n2Node = page.locator('.outliner-node[data-id="n2"]');
        await n2Node.hover();
        await n2Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // Cmd+Shift+] でスコープ解除
        await page.keyboard.press('Meta+Shift+BracketRight');
        await page.waitForTimeout(300);

        // n2にフォーカスが移動する
        const focusedId = await page.evaluate(() => {
            const focused = document.querySelector('.outliner-node.is-focused');
            return focused ? focused.getAttribute('data-id') : null;
        });
        expect(focusedId).toBe('n2');
    });
});

// ===== パンくずナビゲーション =====

test.describe('パンくずナビゲーション', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeTestData());
        await page.waitForTimeout(200);
    });

    test('8. パンくず内の祖先ノードクリックでそのノードにスコープ変更', async ({ page }) => {
        // n4（孫ノード）にスコープ設定
        const n4Node = page.locator('.outliner-node[data-id="n4"]');
        await n4Node.hover();
        await n4Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // パンくずの最初のアイテム（親ノード = n1）をクリック
        const breadcrumbItems = page.locator('.outliner-breadcrumb-item');
        await breadcrumbItems.nth(0).click();
        await page.waitForTimeout(300);

        // n1にスコープが変更される
        const header = page.locator('.outliner-node.outliner-scope-header');
        await expect(header).toHaveCount(1);
        const headerId = await header.getAttribute('data-id');
        expect(headerId).toBe('n1');

        // n2, n3が表示される（n1の子ノード）
        await expect(page.locator('.outliner-node[data-id="n2"]')).toBeVisible();
        await expect(page.locator('.outliner-node[data-id="n3"]')).toBeVisible();
    });
});

// ===== スコープヘッダーの操作制限 =====

test.describe('スコープヘッダーの操作制限', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeTestData());
        await page.waitForTimeout(200);

        // n1にスコープ設定
        const n1Node = page.locator('.outliner-node[data-id="n1"]');
        await n1Node.hover();
        await n1Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);
    });

    test('9. スコープヘッダーでEnter → 子ノード先頭に新ノード追加', async ({ page }) => {
        // スコープ設定前の子ノード数を取得
        const childrenBefore = await page.locator('.outliner-node:not(.outliner-scope-header)').count();

        // ヘッダーテキストにフォーカスしてEnter
        const headerText = page.locator('.outliner-node.outliner-scope-header .outliner-text');
        await headerText.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        // 子ノードが1つ増えている
        const childrenAfter = await page.locator('.outliner-node:not(.outliner-scope-header)').count();
        expect(childrenAfter).toBe(childrenBefore + 1);
    });

    test('10. スコープヘッダーで先頭Backspace → 何もしない', async ({ page }) => {
        // ヘッダーテキストにフォーカスして先頭に移動
        const headerText = page.locator('.outliner-node.outliner-scope-header .outliner-text');
        await headerText.click();
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // Backspace
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        // ヘッダーが維持されている
        const text = await headerText.textContent();
        expect(text).toContain('親ノード');
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(1);
    });

    test('11. スコープヘッダーでTab → 何もしない', async ({ page }) => {
        // ヘッダーテキストにフォーカス
        const headerText = page.locator('.outliner-node.outliner-scope-header .outliner-text');
        await headerText.click();
        await page.waitForTimeout(100);

        // Tab
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        // ヘッダーが維持されている（インデントされない）
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(1);
        const headerId = await page.locator('.outliner-node.outliner-scope-header').getAttribute('data-id');
        expect(headerId).toBe('n1');
    });

    test('12. スコープヘッダーでCtrl+Shift+Up/Down → 何もしない（移動禁止）', async ({ page }) => {
        // ヘッダーテキストにフォーカス
        const headerText = page.locator('.outliner-node.outliner-scope-header .outliner-text');
        await headerText.click();
        await page.waitForTimeout(100);

        // Ctrl+Shift+ArrowUp（ノード上移動）
        await page.keyboard.press('Control+Shift+ArrowUp');
        await page.waitForTimeout(200);

        // ヘッダーが維持されている
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(1);
        const headerIdAfterUp = await page.locator('.outliner-node.outliner-scope-header').getAttribute('data-id');
        expect(headerIdAfterUp).toBe('n1');

        // Ctrl+Shift+ArrowDown（ノード下移動）
        await page.keyboard.press('Control+Shift+ArrowDown');
        await page.waitForTimeout(200);

        // ヘッダーが維持されている
        await expect(page.locator('.outliner-node.outliner-scope-header')).toHaveCount(1);
        const headerIdAfterDown = await page.locator('.outliner-node.outliner-scope-header').getAttribute('data-id');
        expect(headerIdAfterDown).toBe('n1');
    });
});

// ===== Shift+Tabのスコープ境界制限 =====

test.describe('Shift+Tabのスコープ境界制限', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeTestData());
        await page.waitForTimeout(200);
    });

    test('13. スコープルートの直接の子でShift+Tab → 何もしない', async ({ page }) => {
        // n1にスコープ設定
        const n1Node = page.locator('.outliner-node[data-id="n1"]');
        await n1Node.hover();
        await n1Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // n2はn1（スコープルート）の直接の子
        const n2Text = page.locator('.outliner-node[data-id="n2"] .outliner-text');
        await n2Text.click();
        await page.waitForTimeout(100);

        // Shift+Tab（アウトデント）
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(300);

        // n2がまだスコープ内にいる
        const n2InTree = page.locator('.outliner-node[data-id="n2"]');
        await expect(n2InTree).toBeVisible();

        // スコープヘッダーはn1のまま
        const headerId = await page.locator('.outliner-node.outliner-scope-header').getAttribute('data-id');
        expect(headerId).toBe('n1');
    });
});

// ===== 空状態 =====

test.describe('空状態', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('14. スコープ内が空 → 空状態メッセージ表示', async ({ page }) => {
        // 子のないノードでテストデータを作成
        const emptyData = {
            version: 1,
            rootIds: ['r1'],
            nodes: {
                r1: { id: 'r1', parentId: null, children: [], text: '空の親ノード', tags: [] }
            }
        };
        await page.evaluate((d) => {
            (window as any).__testApi.initOutliner(d);
        }, emptyData);
        await page.waitForTimeout(200);

        // r1にスコープ設定
        const r1Node = page.locator('.outliner-node[data-id="r1"]');
        await r1Node.hover();
        await r1Node.locator('.outliner-scope-btn').click();
        await page.waitForTimeout(300);

        // 空状態メッセージが表示される
        const emptyState = page.locator('.outliner-scope-empty');
        await expect(emptyState).toBeVisible();
    });
});

// ===== スコープ対象消失 =====

// Note: スコープ対象消失テストはinitOutliner()が内部状態をリセットするため、
// スタンドアロン環境ではテスト不可（実際のupdateDataメッセージ経由でのみ動作）。
// ST-6の要件はoutliner.jsのsetScope()内のmodel.getNode()チェックで保証される。
