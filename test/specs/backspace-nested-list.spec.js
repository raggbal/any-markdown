"use strict";
/**
 * Backspace on nested empty list items test
 * Tests the bug where <br> disappears when pressing Backspace on deeply nested empty li
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const editor_test_helper_1 = require("../utils/editor-test-helper");

test_1.test.describe('Backspace on nested empty list items', () => {
    let editor;
    
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
        editor = new editor_test_helper_1.EditorTestHelper(page);
    });

    // Test the bug: <br> disappears when pressing Backspace on deeply nested empty li
    // Structure:
    // - gaga
    //   -          <- empty li (A) with <br>
    //     -        <- empty li (B) with <br> - cursor here
    //       - haha
    //
    // After Backspace, expected:
    // - gaga
    //   -          <- empty li (A) with <br> preserved
    //     - haha
    (0, test_1.test)('Backspace on deeply nested empty li should preserve parent <br>', async ({ page }) => {
        // Set up the markdown
        const markdown = `- gaga
  - 
    - 
      - haha`;
        
        await editor.setMarkdown(markdown);
        await page.waitForTimeout(200);
        
        // Get initial HTML
        const initialHtml = await editor.getHtml();
        console.log('Initial HTML:', initialHtml);
        
        // Verify initial structure has <br> elements
        (0, test_1.expect)(initialHtml).toContain('<br>');
        
        // Click on the deepest empty li (the one before "haha")
        // We need to position cursor in the empty li that has the nested list with "haha"
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // Find all li elements
            const allLis = editor.querySelectorAll('li');
            // Find the empty li that has a nested list containing "haha"
            for (const li of allLis) {
                const firstChild = li.firstChild;
                if (firstChild && firstChild.nodeName === 'BR') {
                    const nestedList = li.querySelector(':scope > ul');
                    if (nestedList) {
                        const nestedLi = nestedList.querySelector('li');
                        if (nestedLi) {
                            const deeperNestedList = nestedLi.querySelector(':scope > ul');
                            if (deeperNestedList && deeperNestedList.textContent.includes('haha')) {
                                // This is the li we want - position cursor here
                                const range = document.createRange();
                                range.setStart(li, 0);
                                range.collapse(true);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                                li.focus();
                                return;
                            }
                        }
                    }
                }
            }
        });
        
        await page.waitForTimeout(100);
        
        // Press Backspace
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
        
        // Get HTML after Backspace
        const afterHtml = await editor.getHtml();
        console.log('After Backspace HTML:', afterHtml);
        
        // The parent li should still have <br>
        // Expected: <ul><li>gaga<ul><li><br><ul><li>haha</li></ul></li></ul></li></ul>
        // Bug: <ul><li>gaga<ul><li><ul><li>haha</li></ul></li></ul></li></ul> (missing <br>)
        
        // Count <br> elements - should still have at least one in the nested structure
        const brCount = (afterHtml.match(/<br>/g) || []).length;
        console.log('BR count after Backspace:', brCount);
        
        // The structure should have the parent li with <br> preserved
        // Check that we don't have the bug pattern: <li><ul> (li directly containing ul without <br>)
        const hasBugPattern = /<li><ul>/.test(afterHtml);
        
        (0, test_1.expect)(hasBugPattern).toBe(false);
    });

    // Simpler test: verify the markdown roundtrip preserves empty list items
    (0, test_1.test)('Empty nested list items should be preserved in markdown', async ({ page }) => {
        const markdown = `- gaga
  - 
    - 
      - haha`;
        
        await editor.setMarkdown(markdown);
        await page.waitForTimeout(200);
        
        const resultMarkdown = await editor.getMarkdown();
        console.log('Result markdown:', resultMarkdown);
        
        // The markdown should preserve the empty list items
        // Each empty item should have "- " followed by newline
        const lines = resultMarkdown.split('\n');
        const emptyItemCount = lines.filter(line => /^\s*- $/.test(line)).length;
        
        console.log('Empty item count:', emptyItemCount);
        (0, test_1.expect)(emptyItemCount).toBeGreaterThanOrEqual(2);
    });
});
