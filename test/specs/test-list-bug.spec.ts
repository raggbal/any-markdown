import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('List ArrowUp bug', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        editor = new EditorTestHelper(page);
        await page.goto('/standalone-editor.html');
        await editor.focus();
    });

    test('ArrowUp from last empty nested li should NOT jump out of list', async ({ page }) => {
        // - ds
        //   - sda
        //     - asda
        //   - sd
        //     - sd
        //   - (empty, cursor here)
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>ds<ul><li>sda<ul><li>asda</li></ul></li><li>sd<ul><li>sd</li></ul></li><li><br></li></ul></li></ul>';
        });

        // Place cursor in the last empty <li>
        await page.evaluate(() => {
            const allLis = document.querySelectorAll('li');
            const lastLi = allLis[allLis.length - 1];
            const range = document.createRange();
            range.setStart(lastLi, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        // Press ArrowUp
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(100);

        // Check where cursor ended up - should still be inside the list
        const afterInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            let node = sel.anchorNode;
            while (node && node.nodeType !== 1) node = node.parentNode;
            const isInList = !!node?.closest('ul');
            return { tag: node?.tagName, isInList, text: node?.textContent?.substring(0, 30) };
        });
        console.log('After ArrowUp:', JSON.stringify(afterInfo));
        expect(afterInfo.isInList).toBe(true);
    });
});
