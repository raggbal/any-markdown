/**
 * OutlinerModel テスト
 * CRUD操作、ツリー操作、シリアライズ、タグ解析、ページ操作
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(page: import('@playwright/test').Page) {
    await page.goto('/standalone-outliner.html');
    await page.waitForFunction(() => (window as any).__testApi?.ready);
}

async function init(page: import('@playwright/test').Page, data: any) {
    await page.evaluate((d) => {
        (window as any).__testApi.initOutliner(d);
    }, data);
}

async function focusNode(page: import('@playwright/test').Page, nth: number) {
    const el = page.locator('.outliner-text').nth(nth);
    await el.click();
    await page.waitForTimeout(200);
}

async function nodeCount(page: import('@playwright/test').Page): Promise<number> {
    return page.locator('.outliner-node').count();
}

async function nodeText(page: import('@playwright/test').Page, nth: number): Promise<string> {
    return (await page.locator('.outliner-text').nth(nth).textContent()) ?? '';
}

async function nestedNodeCount(page: import('@playwright/test').Page): Promise<number> {
    return page.locator('.outliner-children .outliner-node').count();
}

async function topLevelNodeCount(page: import('@playwright/test').Page): Promise<number> {
    return page.locator('.outliner-tree > .outliner-node').count();
}

async function focusedId(page: import('@playwright/test').Page): Promise<string | null> {
    return page.evaluate(() => {
        const el = document.querySelector('.outliner-node.is-focused');
        return el ? el.getAttribute('data-id') : null;
    });
}

async function getLastSyncData(page: import('@playwright/test').Page): Promise<any> {
    return page.evaluate(() => {
        const raw = (window as any).__testApi.lastSyncData;
        return raw ? JSON.parse(raw) : null;
    });
}

async function waitForSync(page: import('@playwright/test').Page) {
    await page.waitForTimeout(1500);
}

async function clearMessages(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
        (window as any).__testApi.messages = [];
    });
}

async function getMessages(page: import('@playwright/test').Page, type: string) {
    return page.evaluate((t: string) => {
        return (window as any).__testApi.messages.filter((m: any) => m.type === t);
    }, type);
}

// ---------------------------------------------------------------------------
// Data factories
// ---------------------------------------------------------------------------

function singleNode(id = 'n1', text = 'hello') {
    return {
        version: 1,
        rootIds: [id],
        nodes: { [id]: { id, parentId: null, children: [], text, tags: [] } },
    };
}

function twoNodes(t1 = 'alpha', t2 = 'beta') {
    return {
        version: 1,
        rootIds: ['n1', 'n2'],
        nodes: {
            n1: { id: 'n1', parentId: null, children: [], text: t1, tags: [] },
            n2: { id: 'n2', parentId: null, children: [], text: t2, tags: [] },
        },
    };
}

function threeNodes(t1 = 'one', t2 = 'two', t3 = 'three') {
    return {
        version: 1,
        rootIds: ['n1', 'n2', 'n3'],
        nodes: {
            n1: { id: 'n1', parentId: null, children: [], text: t1, tags: [] },
            n2: { id: 'n2', parentId: null, children: [], text: t2, tags: [] },
            n3: { id: 'n3', parentId: null, children: [], text: t3, tags: [] },
        },
    };
}

function parentChild(parentText = 'parent', childText = 'child') {
    return {
        version: 1,
        rootIds: ['p1'],
        nodes: {
            p1: { id: 'p1', parentId: null, children: ['c1'], text: parentText, tags: [] },
            c1: { id: 'c1', parentId: 'p1', children: [], text: childText, tags: [] },
        },
    };
}

function parentWithTwoChildren() {
    return {
        version: 1,
        rootIds: ['p1'],
        nodes: {
            p1: { id: 'p1', parentId: null, children: ['c1', 'c2'], text: 'parent', tags: [] },
            c1: { id: 'c1', parentId: 'p1', children: [], text: 'child1', tags: [] },
            c2: { id: 'c2', parentId: 'p1', children: [], text: 'child2', tags: [] },
        },
    };
}

// ===========================================================================
// Tests
// ===========================================================================

test.describe('OutlinerModel', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // =======================================================================
    // CRUD操作（ノード追加・削除・更新）
    // =======================================================================

    test.describe.serial('CRUD操作', () => {

        test('1. 空データで初期化→ノード追加→ノードが表示される', async ({ page }) => {
            // 空データで初期化（デフォルトの空ノード1つが作られる）
            await init(page, { version: 1, rootIds: [], nodes: {} });

            // テキスト入力エリアをクリックしてノード追加のトリガー
            // 空状態ではCtrl+Nで新規ノード追加
            await page.keyboard.press('Control+n');
            await page.waitForTimeout(300);

            const count = await nodeCount(page);
            expect(count).toBeGreaterThanOrEqual(1);
        });

        test('2. ノードテキスト編集→syncData経由でモデルに反映される', async ({ page }) => {
            await init(page, singleNode('n1', 'テスト'));

            const textEl = page.locator('.outliner-text').first();
            await textEl.click();
            await page.keyboard.press('End');
            await page.keyboard.type('追加テキスト');

            await waitForSync(page);

            const data = await getLastSyncData(page);
            expect(data).not.toBeNull();
            expect(data.nodes.n1.text).toContain('追加テキスト');
        });

        test('3. 空ノード先頭でBackspace→ノード削除', async ({ page }) => {
            await init(page, twoNodes('ノード1', ''));

            // 2番目の空ノードにフォーカスしてBackspace
            await page.locator('.outliner-text').nth(1).press('Backspace');
            await page.waitForTimeout(300);

            expect(await nodeCount(page)).toBe(1);
            expect(await nodeText(page, 0)).toContain('ノード1');
        });

        test('4. 2ノードのルート→1つ削除→1ノード残る', async ({ page }) => {
            await init(page, twoNodes('残る', ''));

            // 空の2番目のノードでBackspace削除
            await page.locator('.outliner-text').nth(1).press('Backspace');
            await page.waitForTimeout(300);

            expect(await nodeCount(page)).toBe(1);
            expect(await nodeText(page, 0)).toContain('残る');
        });
    });

    // =======================================================================
    // ツリー操作（indent/outdent/move）
    // =======================================================================

    test.describe.serial('ツリー操作', () => {

        test('5. Tab→前の兄弟の子に移動（indent）', async ({ page }) => {
            await init(page, twoNodes('parent', 'child'));

            // 2番目のノードでTab
            await page.locator('.outliner-text').nth(1).press('Tab');
            await page.waitForTimeout(300);

            // n2がn1の子になっている
            expect(await nestedNodeCount(page)).toBe(1);
            expect(await topLevelNodeCount(page)).toBe(1);
        });

        test('6. 先頭ノードでTab→何も起きない', async ({ page }) => {
            await init(page, twoNodes('first', 'second'));

            await page.locator('.outliner-text').nth(0).press('Tab');
            await page.waitForTimeout(300);

            // 構造が変わっていないことを確認
            expect(await topLevelNodeCount(page)).toBe(2);
            expect(await nestedNodeCount(page)).toBe(0);
        });

        test('7. Shift+Tab→親の兄弟に移動（outdent）', async ({ page }) => {
            await init(page, parentChild('parent', 'child'));

            // ネストされたノードでShift+Tab
            await page.locator('.outliner-text').nth(1).press('Shift+Tab');
            await page.waitForTimeout(300);

            expect(await topLevelNodeCount(page)).toBe(2);
        });

        test('8. ルートノードでShift+Tab→何も起きない', async ({ page }) => {
            await init(page, singleNode('n1', 'root'));

            await page.locator('.outliner-text').nth(0).press('Shift+Tab');
            await page.waitForTimeout(300);

            expect(await topLevelNodeCount(page)).toBe(1);
            expect(await nodeText(page, 0)).toContain('root');
        });

        test('9. Ctrl+Shift+Up→兄弟リスト内で上に移動', async ({ page }) => {
            await init(page, threeNodes('one', 'two', 'three'));

            // 3番目のノードにフォーカス
            await page.locator('.outliner-text').nth(2).press('Control+Shift+ArrowUp');
            await page.waitForTimeout(300);

            // 'three'が2番目に移動
            expect(await nodeText(page, 1)).toContain('three');
            expect(await nodeText(page, 2)).toContain('two');
        });

        test('10. Ctrl+Shift+Down→兄弟リスト内で下に移動', async ({ page }) => {
            await init(page, threeNodes('one', 'two', 'three'));

            // 1番目のノードにフォーカス
            await page.locator('.outliner-text').nth(0).press('Control+Shift+ArrowDown');
            await page.waitForTimeout(300);

            // 'one'が2番目に移動
            expect(await nodeText(page, 0)).toContain('two');
            expect(await nodeText(page, 1)).toContain('one');
        });

        test('11. Ctrl+Shift+Up（先頭ノード）→何も起きない', async ({ page }) => {
            await init(page, threeNodes('one', 'two', 'three'));

            await page.locator('.outliner-text').nth(0).press('Control+Shift+ArrowUp');
            await page.waitForTimeout(300);

            // 順序が変わっていない
            expect(await nodeText(page, 0)).toContain('one');
            expect(await nodeText(page, 1)).toContain('two');
            expect(await nodeText(page, 2)).toContain('three');
        });

        test('12. Ctrl+Shift+Down（末尾ノード）→何も起きない', async ({ page }) => {
            await init(page, threeNodes('one', 'two', 'three'));

            await page.locator('.outliner-text').nth(2).press('Control+Shift+ArrowDown');
            await page.waitForTimeout(300);

            // 順序が変わっていない
            expect(await nodeText(page, 0)).toContain('one');
            expect(await nodeText(page, 1)).toContain('two');
            expect(await nodeText(page, 2)).toContain('three');
        });

        test('13. indent時に前兄弟のcollapsedがfalseになる', async ({ page }) => {
            // 折りたたまれた親の後にノードがある状態
            await init(page, {
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['c1'], text: 'collapsed parent', tags: [], collapsed: true },
                    c1: { id: 'c1', parentId: 'n1', children: [], text: 'hidden child', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'sibling', tags: [] },
                },
            });

            // n2にフォーカスしてTab（c1は折りたたまれて非表示なのでdata-node-idで直接指定）
            await page.locator('.outliner-text[data-node-id="n2"]').press('Tab');
            await page.waitForTimeout(300);

            // n1のcollapsedがfalseになっていることを確認（syncDataで検証）
            await waitForSync(page);
            const data = await getLastSyncData(page);
            expect(data.nodes.n1.collapsed).toBe(false);
        });
    });

    // =======================================================================
    // シリアライズ/デシリアライズ
    // =======================================================================

    test.describe('シリアライズ/デシリアライズ', () => {

        test('14. 初期データが正しく読み込まれる（rootIds、ノードテキスト）', async ({ page }) => {
            await init(page, {
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'First', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Second', tags: [] },
                },
            });

            expect(await nodeCount(page)).toBe(2);
            expect(await nodeText(page, 0)).toContain('First');
            expect(await nodeText(page, 1)).toContain('Second');
        });

        test('15. 編集後にsyncDataのJSON出力がversion, rootIds, nodesを含む', async ({ page }) => {
            await init(page, singleNode('n1', 'test'));

            // テキストを編集してsyncDataをトリガー
            await page.locator('.outliner-text').nth(0).press('End');
            await page.keyboard.type('!');

            await waitForSync(page);

            const data = await getLastSyncData(page);
            expect(data).not.toBeNull();
            expect(data.version).toBeDefined();
            expect(data.rootIds).toBeDefined();
            expect(Array.isArray(data.rootIds)).toBe(true);
            expect(data.nodes).toBeDefined();
            expect(data.nodes.n1).toBeDefined();
        });

        test('16. pinnedTags/pageDirがsyncDataに含まれる', async ({ page }) => {
            // pinnedTagsとpageDirを含むデータで初期化
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'test', tags: [] },
                    },
                    pinnedTags: ['#important', '#todo'],
                    pageDir: './custom-pages',
                });
            });

            // 編集してsyncDataをトリガー
            await page.locator('.outliner-text').nth(0).press('End');
            await page.keyboard.type(' ');

            await waitForSync(page);

            const data = await getLastSyncData(page);
            expect(data).not.toBeNull();
            // pinnedTagsとpageDirはsyncDataに含まれるべき
            // (outliner.jsがserialize結果にpinnedTags/pageDirを付加する)
            expect(data.pinnedTags).toBeDefined();
            expect(data.pageDir).toBe('./custom-pages');
        });
    });

    // =======================================================================
    // タグ解析
    // =======================================================================

    test.describe('タグ解析', () => {

        test('17. テキスト内の#tagがタグとして検出される', async ({ page }) => {
            await init(page, {
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'タスク #TODO 完了', tags: ['#TODO'] },
                },
            });

            // タグがDOMにハイライト表示されていることを確認
            const tagSpan = page.locator('.outliner-tag');
            const tagCount = await tagSpan.count();
            expect(tagCount).toBeGreaterThanOrEqual(1);

            const tagText = await tagSpan.first().textContent();
            expect(tagText).toContain('#TODO');
        });

        test('18. テキスト内の@tagがタグとして検出される', async ({ page }) => {
            await init(page, {
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'メンション @user 宛て', tags: ['@user'] },
                },
            });

            const tagSpan = page.locator('.outliner-tag');
            const tagCount = await tagSpan.count();
            expect(tagCount).toBeGreaterThanOrEqual(1);

            const tagText = await tagSpan.first().textContent();
            expect(tagText).toContain('@user');
        });

        test('19. テキスト編集でタグが更新される', async ({ page }) => {
            await init(page, singleNode('n1', 'text'));

            await page.locator('.outliner-text').nth(0).press('End');
            await page.keyboard.type(' #newtag');

            await waitForSync(page);

            const data = await getLastSyncData(page);
            expect(data.nodes.n1.tags).toContain('#newtag');
        });

        test('20. コードブロック内（`#tag`）のタグは検出されない', async ({ page }) => {
            await init(page, {
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'テスト `#notag` テキスト', tags: [] },
                },
            });

            // syncDataのtagsに#notagが含まれないことを確認
            await page.locator('.outliner-text').nth(0).press('End');
            await page.keyboard.type(' ');

            await waitForSync(page);

            const data = await getLastSyncData(page);
            const tags = data.nodes.n1.tags;
            expect(tags).not.toContain('#notag');
        });
    });

    // =======================================================================
    // ページ操作
    // =======================================================================

    test.describe('ページ操作', () => {

        test('21. @page入力+Enter→ページ化（makePage メッセージ送信）', async ({ page }) => {
            await init(page, singleNode('n1', 'My Page'));

            await clearMessages(page);

            await page.locator('.outliner-text').nth(0).press('End');
            await page.keyboard.type(' @page');
            await page.waitForTimeout(100);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);

            const makePageMsgs = await getMessages(page, 'makePage');
            expect(makePageMsgs.length).toBe(1);
            expect(makePageMsgs[0].nodeId).toBe('n1');
            expect(makePageMsgs[0].pageId).toBeTruthy();
        });

        test('22. ページアイコンがDOM上に表示される', async ({ page }) => {
            // ページ化済みのノードで初期化
            await init(page, {
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: {
                        id: 'n1', parentId: null, children: [], text: 'My Page',
                        tags: [], isPage: true, pageId: 'test-uuid-123',
                    },
                },
            });

            // ページアイコンが表示されていることを確認
            const pageIcon = page.locator('.outliner-page-icon');
            const iconCount = await pageIcon.count();
            expect(iconCount).toBe(1);
        });

        test('23. コンテキストメニューからMake Page→host.makePageが呼ばれる', async ({ page }) => {
            await init(page, singleNode('n1', 'Page candidate'));

            await clearMessages(page);

            // ノードを右クリック
            const nodeEl = page.locator('.outliner-node[data-id="n1"]');
            await nodeEl.click({ button: 'right' });
            await page.waitForTimeout(200);

            // "Make Page" メニュー項目をクリック
            const makePageItem = page.locator('.outliner-context-menu-item', { hasText: 'Make Page' });
            const menuItemExists = await makePageItem.count();
            expect(menuItemExists).toBeGreaterThan(0);

            await makePageItem.click();
            await page.waitForTimeout(500);

            // makePageメッセージが送信されたことを確認
            const makePageMsgs = await getMessages(page, 'makePage');
            expect(makePageMsgs.length).toBe(1);
            expect(makePageMsgs[0].nodeId).toBe('n1');
            expect(makePageMsgs[0].pageId).toBeTruthy();
        });
    });
});
