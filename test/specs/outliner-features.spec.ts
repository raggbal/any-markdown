/**
 * Outliner 各種機能テスト
 * 折りたたみ、固定タグ、ナビゲーション履歴、Undo/Redo、ページ、
 * コンテキストメニュー、D&D、syncData、外部変更検知、Daily Notes、複数選択
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

async function focusById(page: import('@playwright/test').Page, id: string) {
    const textEl = page.locator(`.outliner-node[data-id="${id}"] .outliner-text`);
    await textEl.click();
    await page.waitForTimeout(100);
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function parentChildData() {
    return {
        version: 1,
        rootIds: ['p1'],
        nodes: {
            p1: { id: 'p1', parentId: null, children: ['c1', 'c2'], text: 'Parent', tags: [], collapsed: false },
            c1: { id: 'c1', parentId: 'p1', children: [], text: 'Child 1', tags: [] },
            c2: { id: 'c2', parentId: 'p1', children: [], text: 'Child 2', tags: [] }
        }
    };
}

function threeNodeData() {
    return {
        version: 1,
        rootIds: ['n1', 'n2', 'n3'],
        nodes: {
            n1: { id: 'n1', parentId: null, children: [], text: 'Node A', tags: [] },
            n2: { id: 'n2', parentId: null, children: [], text: 'Node B', tags: [] },
            n3: { id: 'n3', parentId: null, children: [], text: 'Node C', tags: [] }
        }
    };
}

// ===========================================================================
// 折りたたみ/展開
// ===========================================================================

test.describe('折りたたみ/展開', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('1. バレットクリック → 折りたたみ（子ノードが非表示、heightが0）', async ({ page }) => {
        await init(page, parentChildData());

        // 子ノードが表示されていることを確認
        const childBefore = await page.locator('.outliner-children .outliner-node').count();
        expect(childBefore).toBe(2);

        // 親ノードのバレットをクリック
        const bullet = page.locator('.outliner-node[data-id="p1"] > .outliner-bullet');
        await bullet.click();
        await page.waitForTimeout(300);

        // 折りたたみ後、子要素の高さが0
        const childrenHeight = await page.evaluate(() => {
            const children = document.querySelector('.outliner-children[data-parent="p1"]');
            if (!children) return -1;
            return children.getBoundingClientRect().height;
        });
        expect(childrenHeight).toBe(0);
    });

    test('2. 折りたたみ後に再度バレットクリック → 展開（子ノード表示）', async ({ page }) => {
        await init(page, parentChildData());

        const bullet = page.locator('.outliner-node[data-id="p1"] > .outliner-bullet');

        // 折りたたみ
        await bullet.click();
        await page.waitForTimeout(300);

        // 展開
        await bullet.click();
        await page.waitForTimeout(300);

        const childrenHeight = await page.evaluate(() => {
            const children = document.querySelector('.outliner-children[data-parent="p1"]');
            if (!children) return 0;
            return children.getBoundingClientRect().height;
        });
        expect(childrenHeight).toBeGreaterThan(0);
    });

    test('3. 折りたたみ時にバレットに子の数を表示', async ({ page }) => {
        await init(page, parentChildData());

        const bullet = page.locator('.outliner-node[data-id="p1"] > .outliner-bullet');
        await bullet.click();
        await page.waitForTimeout(300);

        // 折りたたみ後、バレットに子の数が表示される
        const bulletText = await page.evaluate(() => {
            const nodeEl = document.querySelector('.outliner-node[data-id="p1"]');
            const bulletEl = nodeEl ? nodeEl.querySelector('.outliner-bullet') : null;
            return bulletEl ? bulletEl.textContent?.trim() : '';
        });
        expect(bulletText).toContain('2');
    });

    test('4. 子なしノードのバレットクリック → 何も起きない', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Leaf node', tags: [] }
            }
        });

        const nodeCountBefore = await page.locator('.outliner-node').count();
        const bullet = page.locator('.outliner-node[data-id="n1"] > .outliner-bullet');
        await bullet.click();
        await page.waitForTimeout(200);

        const nodeCountAfter = await page.locator('.outliner-node').count();
        expect(nodeCountAfter).toBe(nodeCountBefore);

        // collapsed クラスが付いていない
        const isCollapsed = await page.locator('.outliner-node[data-id="n1"] > .outliner-children.is-collapsed').count();
        expect(isCollapsed).toBe(0);
    });
});

// ===========================================================================
// Undo/Redo
// ===========================================================================

test.describe('Undo/Redo', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('5. テキスト編集→Undo→元に戻る（モデルレベル）', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Original', tags: [] }
            }
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' added');
        await page.waitForTimeout(200);

        // Undo
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        const text = await textEl.textContent();
        expect(text).not.toContain(' added');
    });

    test('6. Undo→Redo→やり直し', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Original', tags: [] }
            }
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('X');
        await page.waitForTimeout(200);

        // Undo
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);
        const afterUndo = await textEl.textContent();
        expect(afterUndo).not.toContain('X');

        // Redo
        await page.keyboard.press('Meta+Shift+z');
        await page.waitForTimeout(200);
        const afterRedo = await textEl.textContent();
        expect(afterRedo).toContain('X');
    });

    test('7. ファイル切替（fileChangeIdあり updateData）でundoスタッククリア', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'File A', tags: [] }
            }
        });

        // テキスト編集してスナップショットを作る
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        await page.waitForTimeout(200);

        // fileChangeId付きupdateDataを送信（ファイル切替を模擬）
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'updateData',
                data: {
                    version: 1,
                    rootIds: ['n2'],
                    nodes: {
                        n2: { id: 'n2', parentId: null, children: [], text: 'File B', tags: [] }
                    }
                },
                fileChangeId: 42
            });
        });
        await page.waitForTimeout(300);

        // File Bのデータが表示されている
        const newText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(newText).toContain('File B');

        // Undoしても File A には戻らない（スタッククリア済み）
        await page.locator('.outliner-node .outliner-text').first().click();
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        const afterUndo = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(afterUndo).toContain('File B');
    });
});

// ===========================================================================
// ページ機能
// ===========================================================================

test.describe('ページ機能', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('8. @page入力+Enter → makePageメッセージ送信', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'My note', tags: [] }
            }
        });

        await clearMessages(page);

        // ノード右クリックで Make Page
        const nodeEl = page.locator('.outliner-node[data-id="n1"]');
        await nodeEl.click({ button: 'right' });
        await page.waitForTimeout(200);

        const makePageItem = page.locator('.outliner-context-menu-item', { hasText: 'Make Page' });
        await makePageItem.click();
        await page.waitForTimeout(500);

        const msgs = await getMessages(page, 'makePage');
        expect(msgs.length).toBe(1);
        expect(msgs[0].nodeId).toBe('n1');
        expect(msgs[0].pageId).toBeTruthy();
    });

    test('9. ページアイコン（📄）がDOM上に表示される', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'My page', tags: [], isPage: true, pageId: 'uuid-feat-1' }
            }
        });

        const pageIcon = page.locator('.outliner-page-icon');
        expect(await pageIcon.count()).toBe(1);
        const iconText = await pageIcon.textContent();
        expect(iconText).toContain('\uD83D\uDCC4'); // 📄
    });

    test('10. Cmd+Enter（ページノード）→ openPageメッセージ送信', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'My page', tags: [], isPage: true, pageId: 'uuid-feat-2' }
            }
        });

        await focusById(page, 'n1');
        await clearMessages(page);

        await page.keyboard.press('Meta+Enter');
        await page.waitForTimeout(300);

        const msgs = await getMessages(page, 'openPageInSidePanel');
        expect(msgs.length).toBe(1);
        expect(msgs[0].pageId).toBe('uuid-feat-2');
    });
});

// ===========================================================================
// コンテキストメニュー
// ===========================================================================

test.describe('コンテキストメニュー', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('11. ノード右クリック → コンテキストメニュー表示', async ({ page }) => {
        await init(page, threeNodeData());

        const nodeEl = page.locator('.outliner-node[data-id="n1"]');
        await nodeEl.click({ button: 'right' });
        await page.waitForTimeout(200);

        const contextMenu = page.locator('.outliner-context-menu');
        expect(await contextMenu.count()).toBe(1);
        expect(await contextMenu.isVisible()).toBe(true);
    });

    test('12. メニュー外クリック → メニュー閉じる', async ({ page }) => {
        await init(page, threeNodeData());

        const nodeEl = page.locator('.outliner-node[data-id="n1"]');
        await nodeEl.click({ button: 'right' });
        await page.waitForTimeout(200);
        expect(await page.locator('.outliner-context-menu').isVisible()).toBe(true);

        // メニュー外をクリック
        await page.click('body', { position: { x: 10, y: 10 } });
        await page.waitForTimeout(200);

        const menuCount = await page.locator('.outliner-context-menu').count();
        if (menuCount > 0) {
            expect(await page.locator('.outliner-context-menu').isVisible()).toBe(false);
        }
    });

    test('13. 「Delete Node」クリック → ノード削除', async ({ page }) => {
        await init(page, threeNodeData());

        const nodeEl = page.locator('.outliner-node[data-id="n2"]');
        await nodeEl.click({ button: 'right' });
        await page.waitForTimeout(200);

        const deleteItem = page.locator('.outliner-context-menu-item', { hasText: 'Delete' });
        await deleteItem.click();
        await page.waitForTimeout(300);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);
    });
});

// ===========================================================================
// 固定タグ
// ===========================================================================

test.describe('固定タグ', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('14. pinnedTags付きデータで初期化 → 固定タグバーにボタン表示', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Task #TODO', tags: ['#TODO'] }
            },
            pinnedTags: ['#TODO', '#DONE']
        });
        await page.waitForTimeout(300);

        // 固定タグバーにボタンが表示されている
        const pinnedButtons = page.locator('.outliner-pinned-tag-btn');
        const count = await pinnedButtons.count();
        expect(count).toBe(2);

        const texts = await pinnedButtons.allTextContents();
        expect(texts.some(t => t.includes('#TODO'))).toBe(true);
        expect(texts.some(t => t.includes('#DONE'))).toBe(true);
    });

    test('15. 固定タグボタンクリック → 検索テキストにタグ追加+検索実行', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1', 'n2'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Task #TODO', tags: ['#TODO'] },
                n2: { id: 'n2', parentId: null, children: [], text: 'Other node', tags: [] }
            },
            pinnedTags: ['#TODO']
        });
        await page.waitForTimeout(300);

        const pinnedBtn = page.locator('.outliner-pinned-tag-btn').first();
        await pinnedBtn.click();
        await page.waitForTimeout(500);

        // 検索バーにタグが入力されている
        const searchValue = await page.locator('.outliner-search-input').inputValue();
        expect(searchValue).toContain('#TODO');

        // フィルタされてn1のみ表示
        const visibleNodes = await page.locator('.outliner-node').count();
        expect(visibleNodes).toBe(1);
    });

    test('16. もう一度クリック → タグ除去（トグル）', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1', 'n2'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Task #TODO', tags: ['#TODO'] },
                n2: { id: 'n2', parentId: null, children: [], text: 'Other', tags: [] }
            },
            pinnedTags: ['#TODO']
        });
        await page.waitForTimeout(300);

        const pinnedBtn = page.locator('.outliner-pinned-tag-btn').first();

        // 1回目: タグ追加
        await pinnedBtn.click();
        await page.waitForTimeout(500);
        const searchAfterAdd = await page.locator('.outliner-search-input').inputValue();
        expect(searchAfterAdd).toContain('#TODO');

        // 2回目: タグ除去（トグル）
        await pinnedBtn.click();
        await page.waitForTimeout(500);
        const searchAfterRemove = await page.locator('.outliner-search-input').inputValue();
        expect(searchAfterRemove).not.toContain('#TODO');

        // 全ノード表示に戻る
        const visibleNodes = await page.locator('.outliner-node').count();
        expect(visibleNodes).toBe(2);
    });
});

// ===========================================================================
// ナビゲーション履歴
// ===========================================================================

test.describe('ナビゲーション履歴', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('17. 検索実行 → ナビゲーション履歴にpush', async ({ page }) => {
        await init(page, threeNodeData());

        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await searchInput.fill('Node A');
        await page.waitForTimeout(500);

        // 戻るボタンが有効になっている（履歴がある）
        const backBtn = page.locator('.outliner-nav-back-btn');
        const isDisabled = await backBtn.evaluate((el: HTMLButtonElement) => el.disabled);
        expect(isDisabled).toBe(false);
    });

    test('18. 戻るボタンクリック → 前の状態に戻る', async ({ page }) => {
        await init(page, threeNodeData());

        const searchInput = page.locator('.outliner-search-input');

        // 最初の検索
        await searchInput.click();
        await searchInput.fill('Node A');
        await page.waitForTimeout(500);

        // 2回目の検索
        await searchInput.fill('Node B');
        await page.waitForTimeout(500);

        // 戻る
        const backBtn = page.locator('.outliner-nav-back-btn');
        await backBtn.click();
        await page.waitForTimeout(300);

        // 検索テキストが前の状態に戻っている
        const searchValue = await searchInput.inputValue();
        expect(searchValue).toBe('Node A');
    });

    test('19. 進むボタンクリック → 次の状態に進む', async ({ page }) => {
        await init(page, threeNodeData());

        const searchInput = page.locator('.outliner-search-input');

        // 検索1
        await searchInput.click();
        await searchInput.fill('Node A');
        await page.waitForTimeout(500);

        // 検索2
        await searchInput.fill('Node B');
        await page.waitForTimeout(500);

        // 戻る
        const backBtn = page.locator('.outliner-nav-back-btn');
        await backBtn.click();
        await page.waitForTimeout(300);

        // 進む
        const forwardBtn = page.locator('.outliner-nav-forward-btn');
        await forwardBtn.click();
        await page.waitForTimeout(300);

        const searchValue = await searchInput.inputValue();
        expect(searchValue).toBe('Node B');
    });
});

// ===========================================================================
// syncDataデバウンス
// ===========================================================================

test.describe('syncDataデバウンス', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('20. テキスト編集後、1000ms以内はsyncDataが送信されない', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Hello', tags: [] }
            }
        });

        // lastSyncDataをクリア
        await page.evaluate(() => {
            (window as any).__testApi.lastSyncData = null;
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');

        // 500ms後: まだsyncされていない
        await page.waitForTimeout(500);
        const syncBefore = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncBefore).toBeNull();
    });

    test('21. 1000ms経過後にsyncDataが送信される', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Hello', tags: [] }
            }
        });

        await page.evaluate(() => {
            (window as any).__testApi.lastSyncData = null;
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');

        // 1500ms待つ（デバウンス1000ms + バッファ）
        await page.waitForTimeout(1500);
        const syncAfter = await page.evaluate(() => (window as any).__testApi.lastSyncData);
        expect(syncAfter).not.toBeNull();

        const data = JSON.parse(syncAfter);
        expect(data.nodes.n1.text).toContain('!');
    });
});

// ===========================================================================
// 外部変更検知
// ===========================================================================

test.describe('外部変更検知', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('22. アイドル状態でupdateData受信（fileChangeIdなし）→ 即時適用', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Before', tags: [] }
            }
        });

        // 外部変更を送信（fileChangeIdなし = 外部変更）
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'updateData',
                data: {
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'After external', tags: [] }
                    }
                }
            });
        });
        await page.waitForTimeout(300);

        const text = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(text).toContain('After external');
    });

    test('23. 編集中にupdateData受信 → キューに保存、1.5秒後に適用', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Original', tags: [] }
            }
        });

        // 編集開始（アクティブ状態にする）
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type('X');
        await page.waitForTimeout(100);

        // 編集中に外部変更を送信
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'updateData',
                data: {
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'External update', tags: [] }
                    }
                }
            });
        });

        // 直後は外部変更が適用されていない（キューイング中）
        await page.waitForTimeout(200);
        const textImmediate = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(textImmediate).toContain('X');

        // 2秒後（1.5秒アイドル + バッファ）に適用される
        await page.waitForTimeout(2000);
        const textLater = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(textLater).toContain('External update');
    });
});

// ===========================================================================
// Daily Notes ナビバー
// ===========================================================================

test.describe('Daily Notes ナビバー', () => {
    // Daily Notesナビバーは notesWebviewContent.ts にのみ存在するため standalone-notes.html を使用
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('24. isDailyNotes=true のupdateData → ナビバー表示', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: '2026-03-31 Today', tags: [] }
            }
        });

        // isDailyNotes付きupdateDataを送信
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'updateData',
                data: {
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: '2026-03-31 Today', tags: [] }
                    }
                },
                isDailyNotes: true,
                fileChangeId: 1
            });
        });
        await page.waitForTimeout(300);

        // Daily Notesナビバーが表示される
        const navBar = page.locator('.outliner-daily-nav-area');
        const isVisible = await navBar.isVisible();
        expect(isVisible).toBe(true);
    });

    test('25. isDailyNotes=false → ナビバー非表示', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'Regular note', tags: [] }
            }
        });

        // isDailyNotesなしのupdateData
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'updateData',
                data: {
                    version: 1,
                    rootIds: ['n1'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: [], text: 'Regular note', tags: [] }
                    }
                },
                isDailyNotes: false,
                fileChangeId: 2
            });
        });
        await page.waitForTimeout(300);

        const navBar = page.locator('.outliner-daily-nav-area');
        const count = await navBar.count();
        if (count > 0) {
            const isVisible = await navBar.isVisible();
            expect(isVisible).toBe(false);
        }
        // count === 0 の場合もOK（要素が存在しない = 非表示）
    });
});

// ===========================================================================
// 複数選択
// ===========================================================================

test.describe('複数選択', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('26. Shift+Down×2 → 2ノード選択', async ({ page }) => {
        await init(page, threeNodeData());

        await focusById(page, 'n1');

        // Shift+Down 1回目: 自行を選択
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);

        // Shift+Down 2回目: 次の行も選択
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);

        const selectedCount = await page.locator('.outliner-node.is-selected').count();
        expect(selectedCount).toBe(2);
    });

    test('27. 選択中にDelete → 選択ノード削除', async ({ page }) => {
        await init(page, threeNodeData());

        await focusById(page, 'n1');

        // Shift+Down で2ノード選択
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);

        // Delete (Backspace) で削除
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBeLessThan(3);
    });
});

// ===========================================================================
// ドラッグ&ドロップ（検証可能な範囲で）
// ===========================================================================

test.describe('ドラッグ&ドロップ', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    test('28. バレットにdraggable="true"属性がある', async ({ page }) => {
        await init(page, threeNodeData());

        const bullets = page.locator('.outliner-bullet');
        const count = await bullets.count();
        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i++) {
            const draggable = await bullets.nth(i).getAttribute('draggable');
            expect(draggable).toBe('true');
        }
    });
});
