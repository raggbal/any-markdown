/**
 * Outliner inline decoration tests
 * Cmd+B/I/E/Shift+S marker insert/remove, renderInlineText (blur decoration), tag escape
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
    await page.waitForTimeout(100);
}

/** Select a range of text within the first .outliner-text element (skipping page icon nodes). */
async function selectTextRange(page: import('@playwright/test').Page, start: number, end: number) {
    await page.evaluate(({ s, e }) => {
        const el = document.querySelector('.outliner-text') as HTMLElement;
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        // Skip page icon text nodes if present
        while (textNode && textNode.parentElement?.classList.contains('outliner-page-icon')) {
            textNode = walker.nextNode();
        }
        if (textNode) {
            range.setStart(textNode, s);
            range.setEnd(textNode, e);
            const sel = window.getSelection()!;
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, { s: start, e: end });
}

/** Return the last syncData as a parsed object, or null. */
async function getSyncData(page: import('@playwright/test').Page): Promise<any | null> {
    const raw = await page.evaluate(() => (window as any).__testApi.lastSyncData);
    return raw ? JSON.parse(raw) : null;
}

function singleNode(id = 'n1', text = 'hello world') {
    return {
        version: 1,
        rootIds: [id],
        nodes: { [id]: { id, parentId: null, children: [], text, tags: [] } },
    };
}

function twoNodes(id1 = 'n1', text1 = 'first', id2 = 'n2', text2 = 'second') {
    return {
        version: 1,
        rootIds: [id1, id2],
        nodes: {
            [id1]: { id: id1, parentId: null, children: [], text: text1, tags: [] },
            [id2]: { id: id2, parentId: null, children: [], text: text2, tags: [] },
        },
    };
}

// ===========================================================================
// Cmd+B (bold)
// ===========================================================================

test.describe('Outliner Cmd+B (bold)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 1. Select text + Cmd+B -> **text** marker inserted
    test('1. Cmd+B with selection inserts **text** markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello world'));
        await focusNode(page, 0);
        // Select "world" (offset 6-11)
        await selectTextRange(page, 6, 11);

        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).toContain('**world**');
    });

    // 2. Select **text** + Cmd+B -> markers removed (toggle)
    test('2. Cmd+B toggle removes existing ** markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello **world**'));
        await focusNode(page, 0);
        // In edit mode, markers are visible: "hello **world**"
        // Select "world" (offset 8-13)
        await selectTextRange(page, 8, 13);

        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).not.toContain('**');
        expect(data.nodes.n1.text).toContain('world');
    });

    // 3. No selection + Cmd+B -> **** inserted, cursor between markers
    test('3. Cmd+B with no selection inserts **** with cursor between markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello'));
        await focusNode(page, 0);
        await page.keyboard.press('End');

        await page.keyboard.press('Meta+b');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).toContain('****');

        // Verify cursor is between markers by typing
        await page.keyboard.type('X');
        await page.waitForTimeout(1500);

        const data2 = await getSyncData(page);
        expect(data2).not.toBeNull();
        expect(data2.nodes.n1.text).toContain('**X**');
    });
});

// ===========================================================================
// Cmd+I (italic)
// ===========================================================================

test.describe('Outliner Cmd+I (italic)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 4. Select text + Cmd+I -> *text* marker inserted
    test('4. Cmd+I with selection inserts *text* markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello world'));
        await focusNode(page, 0);
        await selectTextRange(page, 6, 11);

        await page.keyboard.press('Meta+i');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).toContain('*world*');
        // Should not be bold marker
        expect(data.nodes.n1.text).not.toContain('**world**');
    });

    // 5. Select *text* + Cmd+I -> markers removed (toggle)
    test('5. Cmd+I toggle removes existing * markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello *world*'));
        await focusNode(page, 0);
        // In edit mode: "hello *world*"
        // Select "world" (offset 7-12)
        await selectTextRange(page, 7, 12);

        await page.keyboard.press('Meta+i');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).not.toContain('*');
        expect(data.nodes.n1.text).toContain('world');
    });
});

// ===========================================================================
// Cmd+E (inline code)
// ===========================================================================

test.describe('Outliner Cmd+E (inline code)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 6. Select text + Cmd+E -> `text` marker inserted
    test('6. Cmd+E with selection inserts `text` markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello world'));
        await focusNode(page, 0);
        await selectTextRange(page, 6, 11);

        await page.keyboard.press('Meta+e');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).toContain('`world`');
    });
});

// ===========================================================================
// Cmd+Shift+S (strikethrough)
// ===========================================================================

test.describe('Outliner Cmd+Shift+S (strikethrough)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 7. Select text + Cmd+Shift+S -> ~~text~~ marker inserted
    test('7. Cmd+Shift+S with selection inserts ~~text~~ markers', async ({ page }) => {
        await init(page, singleNode('n1', 'hello world'));
        await focusNode(page, 0);
        await selectTextRange(page, 6, 11);

        await page.keyboard.press('Meta+Shift+s');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        expect(data).not.toBeNull();
        expect(data.nodes.n1.text).toContain('~~world~~');
    });
});

// ===========================================================================
// renderInlineText (blur decoration)
// ===========================================================================

test.describe('Outliner renderInlineText (blur decoration)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 8. **bold** text -> strong tag on blur
    test('8. **bold** text renders as strong tag on blur', async ({ page }) => {
        await init(page, singleNode('n1', '**bold**'));

        // blur state by default (no focus)
        const strongCount = await page.locator('.outliner-text strong').count();
        expect(strongCount).toBe(1);

        const strongText = await page.locator('.outliner-text strong').first().textContent();
        expect(strongText).toBe('bold');
    });

    // 9. *italic* text -> em tag on blur (does not match ** partial)
    test('9. *italic* text renders as em tag on blur', async ({ page }) => {
        await init(page, singleNode('n1', '*italic*'));

        const emCount = await page.locator('.outliner-text em').count();
        expect(emCount).toBe(1);

        const emText = await page.locator('.outliner-text em').first().textContent();
        expect(emText).toBe('italic');

        // Verify ** does not get partial italic match (O-3 rule)
        await init(page, singleNode('n1', '**bold**'));
        const emCountAfter = await page.locator('.outliner-text em').count();
        expect(emCountAfter).toBe(0);
    });

    // 10. ~~strike~~ text -> del tag on blur
    test('10. ~~strike~~ text renders as del tag on blur', async ({ page }) => {
        await init(page, singleNode('n1', '~~strike~~'));

        const delCount = await page.locator('.outliner-text del').count();
        expect(delCount).toBe(1);

        const delText = await page.locator('.outliner-text del').first().textContent();
        expect(delText).toBe('strike');
    });

    // 11. `code` text -> code tag on blur
    test('11. `code` text renders as code tag on blur', async ({ page }) => {
        await init(page, singleNode('n1', '`code`'));

        const codeCount = await page.locator('.outliner-text code').count();
        expect(codeCount).toBe(1);

        const codeText = await page.locator('.outliner-text code').first().textContent();
        expect(codeText).toBe('code');
    });

    // 12. #tag text -> .outliner-tag span on blur
    test('12. #tag text renders as .outliner-tag span on blur', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: 'task #TODO done', tags: ['#TODO'] }
            }
        });

        const tagSpan = page.locator('.outliner-text .outliner-tag');
        expect(await tagSpan.count()).toBeGreaterThanOrEqual(1);
        expect(await tagSpan.first().textContent()).toBe('#TODO');
    });

    // 13. [text](url) text -> a tag on blur
    test('13. [text](url) text renders as a tag on blur', async ({ page }) => {
        await init(page, singleNode('n1', 'click [here](https://example.com) now'));

        const linkCount = await page.locator('.outliner-text a').count();
        expect(linkCount).toBe(1);

        const linkEl = page.locator('.outliner-text a').first();
        const linkText = await linkEl.textContent();
        expect(linkText).toBe('here');

        const href = await linkEl.getAttribute('href');
        expect(href).toBe('https://example.com');
    });
});

// ===========================================================================
// Tag escape (T-5)
// ===========================================================================

test.describe('Outliner tag escape (T-5)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 14. Space inside tag span -> cursor moves outside + space inserted
    test('14. Space inside tag span moves cursor outside and inserts space', async ({ page }) => {
        await init(page, {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: [], text: '#tag', tags: ['#tag'] }
            }
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(100);

        // Place cursor at end of text (inside tag span in edit mode)
        await page.keyboard.press('End');
        await page.keyboard.press('Space');
        await page.waitForTimeout(1500);

        const data = await getSyncData(page);
        if (data) {
            // The text should have a space after #tag
            expect(data.nodes.n1.text).toContain('#tag ');
        }

        // Verify cursor is outside the tag span by typing additional text
        await page.keyboard.type('next');
        await page.waitForTimeout(1500);

        const data2 = await getSyncData(page);
        expect(data2).not.toBeNull();
        // "next" should be outside the tag, not appended to it
        expect(data2.nodes.n1.text).toContain('#tag next');
    });
});

// ===========================================================================
// Edit/Display mode separation (O-1)
// ===========================================================================

test.describe('Outliner edit/display mode separation (O-1)', () => {
    test.beforeEach(async ({ page }) => {
        await setup(page);
    });

    // 15. Focus shows raw text (markers visible as-is)
    test('15. Focus shows raw text with markers visible', async ({ page }) => {
        await init(page, twoNodes('n1', '**bold** and *italic*', 'n2', 'other'));

        // Initially blurred: should have HTML decoration (strong/em tags)
        const strongCountBefore = await page.locator('.outliner-text').first().locator('strong').count();
        expect(strongCountBefore).toBe(1);

        // Focus the node
        await focusNode(page, 0);

        // In edit mode (renderEditingText): markers should be visible as raw text
        // The textContent should contain the raw markers ** and *
        const textContent = await page.locator('.outliner-text').first().textContent();
        expect(textContent).toContain('**bold**');
        expect(textContent).toContain('*italic*');

        // HTML tags should NOT be present during editing
        const strongCountFocus = await page.locator('.outliner-text').first().locator('strong').count();
        expect(strongCountFocus).toBe(0);
        const emCountFocus = await page.locator('.outliner-text').first().locator('em').count();
        expect(emCountFocus).toBe(0);
    });

    // 16. Blur shows HTML decoration (markers converted to tags)
    test('16. Blur shows HTML decoration with markers converted to tags', async ({ page }) => {
        await init(page, twoNodes('n1', '**bold** and *italic*', 'n2', 'other'));

        // Focus then blur by clicking another node
        await focusNode(page, 0);
        await page.waitForTimeout(100);

        // Blur by clicking the second node
        await focusNode(page, 1);
        await page.waitForTimeout(200);

        // After blur, the first node should have HTML decoration
        const firstText = page.locator('.outliner-text').first();
        const strongCount = await firstText.locator('strong').count();
        expect(strongCount).toBe(1);
        const strongText = await firstText.locator('strong').first().textContent();
        expect(strongText).toBe('bold');

        const emCount = await firstText.locator('em').count();
        expect(emCount).toBe(1);
        const emText = await firstText.locator('em').first().textContent();
        expect(emText).toBe('italic');

        // Raw markers should NOT be visible in innerHTML
        const innerHTML = await firstText.evaluate(el => el.innerHTML);
        expect(innerHTML).not.toContain('**bold**');
        expect(innerHTML).toContain('<strong>');
        expect(innerHTML).toContain('<em>');
    });
});
