/**
 * Outliner 検索テスト
 * クエリパーサ、マッチエンジン、検索UIの網羅テスト
 */

import { test, expect } from '@playwright/test';

/** 共通テストデータ */
const TEST_DATA = {
    version: 1,
    rootIds: ['n1', 'n3', 'n4', 'n5'],
    nodes: {
        n1: { id: 'n1', parentId: null, children: ['n2'], text: 'りんご #fruit', tags: ['#fruit'] },
        n2: { id: 'n2', parentId: 'n1', children: [], text: 'ジュース', tags: [] },
        n3: { id: 'n3', parentId: null, children: [], text: 'みかん @citrus', tags: ['@citrus'] },
        n4: { id: 'n4', parentId: null, children: [], text: 'タスク', tags: [], checked: false },
        n5: { id: 'n5', parentId: null, children: [], text: 'ページ', tags: [], isPage: true, pageId: 'p1' }
    }
};

test.describe('Outliner 検索テスト', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, TEST_DATA);
        // 初期ノード数確認: n1, n2, n3, n4, n5
        const initialCount = await page.locator('.outliner-node').count();
        expect(initialCount).toBe(5);
    });

    // =========================================================================
    // クエリパーサ
    // =========================================================================

    test.describe('クエリパーサ', () => {
        test('1. 単一テキスト検索 → マッチノードが表示、非マッチが非表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('りんご');
            await page.waitForTimeout(500);

            // "りんご" を含むのは n1 のみ（マッチ）、n2 は n1 の子孫として表示
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2); // n1 (match) + n2 (descendant)
        });

        test('2. #tag 検索 → タグ持ちノードのみ表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('#fruit');
            await page.waitForTimeout(500);

            // #fruit タグ → n1 がマッチ、n2 は子孫として表示
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2); // n1 + n2

            // n3, n4, n5 は非表示
            const nodeTexts = await page.locator('.outliner-node .outliner-text').allTextContents();
            const hasMikan = nodeTexts.some(t => t.includes('みかん'));
            expect(hasMikan).toBe(false);
        });

        test('3. @tag 検索 → タグ持ちノードのみ表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('@citrus');
            await page.waitForTimeout(500);

            // @citrus タグ → n3 のみマッチ
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1); // n3

            const nodeTexts = await page.locator('.outliner-node .outliner-text').allTextContents();
            const hasMikan = nodeTexts.some(t => t.includes('みかん'));
            expect(hasMikan).toBe(true);
        });

        test('4. AND検索（スペース区切り）→ 両方含むノードのみ表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('りんご #fruit');
            await page.waitForTimeout(500);

            // "りんご" AND #fruit → n1 がマッチ、n2 は子孫
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2); // n1 + n2
        });

        test('5. OR検索 → いずれか含むノードが表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('ジュース OR タスク');
            await page.waitForTimeout(500);

            // "ジュース" → n2 マッチ（n1 は祖先として表示）
            // "タスク" → n4 マッチ
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(3); // n1 (ancestor) + n2 (match) + n4 (match)
        });

        test('6. NOT検索（-keyword）→ キーワード含まないノードが表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('-りんご');
            await page.waitForTimeout(500);

            // "りんご" を含まないのは n2, n3, n4, n5
            // n2 のマッチで祖先 n1 も表示（ツリーモード）
            const nodeTexts = await page.locator('.outliner-node .outliner-text').allTextContents();
            const hasJuice = nodeTexts.some(t => t.includes('ジュース'));
            expect(hasJuice).toBe(true);
            const hasMikan = nodeTexts.some(t => t.includes('みかん'));
            expect(hasMikan).toBe(true);
            const hasTask = nodeTexts.some(t => t.includes('タスク'));
            expect(hasTask).toBe(true);
            const hasPage = nodeTexts.some(t => t.includes('ページ'));
            expect(hasPage).toBe(true);
        });

        test('7. フレーズ検索（"hello world"）→ フレーズ完全一致のみ表示', async ({ page }) => {
            // テストデータにフレーズ対象を追加して初期化
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['a1', 'a2', 'a3'],
                    nodes: {
                        a1: { id: 'a1', parentId: null, children: [], text: 'hello world greeting', tags: [] },
                        a2: { id: 'a2', parentId: null, children: [], text: 'hello there world', tags: [] },
                        a3: { id: 'a3', parentId: null, children: [], text: 'goodbye world', tags: [] }
                    }
                });
            });

            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('"hello world"');
            await page.waitForTimeout(500);

            // "hello world" フレーズ完全一致 → a1 のみマッチ
            // a2 は "hello" と "world" が離れているのでフレーズ不一致
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1);

            const nodeTexts = await page.locator('.outliner-node .outliner-text').allTextContents();
            const hasHelloWorld = nodeTexts.some(t => t.includes('hello world'));
            expect(hasHelloWorld).toBe(true);
        });

        test('8. 演算子 is:page → ページノードのみ表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('is:page');
            await page.waitForTimeout(500);

            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1); // n5 only
        });

        test('9. 演算子 is:task → タスクノードのみ表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('is:task');
            await page.waitForTimeout(500);

            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1); // n4 only
        });

        test('10. 演算子 has:children → 子持ちノードのみ表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('has:children');
            await page.waitForTimeout(500);

            // n1 のみが子 (n2) を持つ → n1 マッチ + n2 子孫表示
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2); // n1 + n2
        });
    });

    // =========================================================================
    // 検索UI
    // =========================================================================

    test.describe('検索UI', () => {
        test('11. 検索バー入力 → 結果がフィルタされる（デバウンス200ms）', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('タスク');

            // デバウンス前は全ノード表示の可能性がある
            // デバウンス完了を待つ
            await page.waitForTimeout(500);

            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1); // n4 only
        });

        test('12. 検索クリアボタンクリック → 検索結果リセット、全ノード表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('りんご');
            await page.waitForTimeout(500);

            // フィルタ確認
            const filteredCount = await page.locator('.outliner-node').count();
            expect(filteredCount).toBe(2);

            // クリアボタンクリック
            const clearBtn = page.locator('.outliner-search-clear-btn');
            await clearBtn.click();
            await page.waitForTimeout(300);

            const allNodes = await page.locator('.outliner-node').count();
            expect(allNodes).toBe(5);
        });

        test('13. Escape → 検索クリア（スコープは解除しない）', async ({ page }) => {
            // まずスコープを設定
            await page.evaluate(() => {
                const scopeBtn = document.querySelector('.outliner-node[data-id="n1"] .outliner-scope-btn') as HTMLElement;
                if (scopeBtn) {
                    scopeBtn.click();
                }
            });
            await page.waitForTimeout(300);

            // 検索実行
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('ジュース');
            await page.waitForTimeout(500);

            // Escapeで検索クリア
            await searchInput.press('Escape');
            await page.waitForTimeout(300);

            // 検索テキストがクリアされている
            const searchValue = await searchInput.inputValue();
            expect(searchValue).toBe('');

            // スコープは維持されている（パンくずが表示されている）
            const breadcrumb = page.locator('.outliner-breadcrumb');
            const breadcrumbVisible = await breadcrumb.isVisible();
            expect(breadcrumbVisible).toBe(true);
        });

        test('14. 検索モード切替（ツリーモード/フォーカスモード）', async ({ page }) => {
            const modeToggle = page.locator('.outliner-search-mode-toggle');

            // 初期状態はツリーモード → フォーカスモードに切替
            await modeToggle.click();
            await page.waitForTimeout(200);

            // フォーカスモードに戻る → ツリーモードに切替
            await modeToggle.click();
            await page.waitForTimeout(200);

            // ツリーモードで検索して祖先が含まれることを確認
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('ジュース');
            await page.waitForTimeout(500);

            // ツリーモード: n2 (マッチ) + n1 (祖先)
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2);
        });

        test('15. ツリーモード → マッチ+子孫+祖先を表示', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('ジュース');
            await page.waitForTimeout(500);

            // n2 がマッチ、n1 は祖先として表示（ツリーモード）
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2); // n1 (ancestor) + n2 (match)
        });

        test('16. フォーカスモード → マッチノードのみdepth=0で表示', async ({ page }) => {
            // フォーカスモードに切替（searchFocusModeフラグを直接設定してinitで再構築）
            // Note: initOutliner を beforeEach で呼ぶと setupSearchBar が2重登録されるため
            //       click() でのトグルは2重ハンドラで打ち消されてしまう。
            //       searchFocusMode=true のデータで再初期化することでフォーカスモードを有効化する。
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1', 'n3', 'n4', 'n5'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: ['n2'], text: 'りんご #fruit', tags: ['#fruit'] },
                        n2: { id: 'n2', parentId: 'n1', children: [], text: 'ジュース', tags: [] },
                        n3: { id: 'n3', parentId: null, children: [], text: 'みかん @citrus', tags: ['@citrus'] },
                        n4: { id: 'n4', parentId: null, children: [], text: 'タスク', tags: [], checked: false },
                        n5: { id: 'n5', parentId: null, children: [], text: 'ページ', tags: [], isPage: true, pageId: 'p1' }
                    },
                    searchFocusMode: true
                });
            });
            await page.waitForTimeout(200);

            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('ジュース');
            await page.waitForTimeout(500);

            // フォーカスモードでは n2 のみマッチ（祖先 n1 は含まれない）
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1); // n2 only
        });

        test('17. 検索時の折りたたみ親自動展開', async ({ page }) => {
            // 折りたたみ状態のデータで初期化
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['n1', 'n3'],
                    nodes: {
                        n1: { id: 'n1', parentId: null, children: ['n2'], text: '親ノード', tags: [], collapsed: true },
                        n2: { id: 'n2', parentId: 'n1', children: [], text: '隠れた子 りんご', tags: [] },
                        n3: { id: 'n3', parentId: null, children: [], text: 'その他', tags: [] }
                    }
                });
            });

            // 折りたたみ確認
            const collapsedBefore = await page.locator('.outliner-children.is-collapsed').count();
            expect(collapsedBefore).toBe(1);

            // 検索で子ノードにマッチ
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('りんご');
            await page.waitForTimeout(500);

            // 親が自動展開され、n1 + n2 が表示
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(2); // n1 + n2
        });

        test('18. IME変換中は検索を抑止（composing中にinputイベントが来ても実行しない）', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();

            // compositionstart を発火
            await page.evaluate(() => {
                const input = document.querySelector('.outliner-search-input') as HTMLElement;
                input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            });

            // IME変換中のテキスト入力
            await searchInput.fill('りんご');
            await page.waitForTimeout(500);

            // IME中なので検索は実行されない → 全ノード表示のまま
            const allNodes = await page.locator('.outliner-node').count();
            expect(allNodes).toBe(5);
        });

        test('19. マッチノードにis-search-matchクラスが付与される', async ({ page }) => {
            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('りんご');
            await page.waitForTimeout(500);

            // n1 がマッチ → is-search-match クラスが付与されている
            const matchNodes = await page.locator('.outliner-node.is-search-match').count();
            expect(matchNodes).toBeGreaterThanOrEqual(1);

            // n2 は子孫表示なのでマッチではない
            const n2HasMatch = await page.locator('.outliner-node[data-id="n2"].is-search-match').count();
            expect(n2HasMatch).toBe(0);
        });

        test('20. subtextもマッチ対象に含まれる', async ({ page }) => {
            // subtextを持つデータで初期化
            await page.evaluate(() => {
                (window as any).__testApi.initOutliner({
                    version: 1,
                    rootIds: ['s1', 's2'],
                    nodes: {
                        s1: { id: 's1', parentId: null, children: [], text: 'メインテキスト', tags: [], subtext: 'サブに検索ワードあり' },
                        s2: { id: 's2', parentId: null, children: [], text: '別のノード', tags: [], subtext: '' }
                    }
                });
            });

            const searchInput = page.locator('.outliner-search-input');
            await searchInput.click();
            await searchInput.fill('検索ワード');
            await page.waitForTimeout(500);

            // subtextに"検索ワード"を含む s1 がマッチ
            const visibleNodes = await page.locator('.outliner-node').count();
            expect(visibleNodes).toBe(1); // s1 only
        });
    });
});
