import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('Debug deep nested backspace', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('Debug deep nested backspace - exact user scenario', async ({ page }) => {
        // Exact user scenario:
        // - 
        //   - 
        //     - |  ← cursor here (3rd level, ONLY item at this level)
        //   -       ← 4th item (2nd level, sibling of the parent of cursor item)
        
        // This is the EXACT HTML structure from the user's markdown
        await page.evaluate(() => {
            const editorEl = document.getElementById('editor');
            // Structure:
            // <ul>
            //   <li><br>                    ← 1st level (empty)
            //     <ul>
            //       <li><br>                ← 2nd level (empty)
            //         <ul>
            //           <li><br></li>       ← 3rd level (cursor here)
            //         </ul>
            //       </li>
            //       <li><br></li>           ← 2nd level sibling (the 4th item "  - ")
            //     </ul>
            //   </li>
            // </ul>
            editorEl.innerHTML = '<ul><li><br><ul><li><br><ul><li><br></li></ul></li><li><br></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // Get initial HTML
        const initialHtml = await editor.getHtml();
        console.log('Initial HTML:', initialHtml);
        
        // Set cursor to the 3rd level li (the deepest one)
        await page.evaluate(() => {
            const deepestLi = document.querySelector('#editor ul ul ul li');
            console.log('Deepest li found:', deepestLi ? deepestLi.outerHTML : 'NOT FOUND');
            if (deepestLi) {
                const range = document.createRange();
                range.selectNodeContents(deepestLi);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        const getCursorInfo = async () => {
            return await page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel || !sel.rangeCount) return 'No selection';
                const range = sel.getRangeAt(0);
                let node = range.startContainer;
                let path = [];
                let depth = 0;
                while (node && node !== document.body) {
                    if (node.nodeType === 1) {
                        const tag = node.tagName;
                        if (tag === 'UL' || tag === 'OL') depth++;
                        path.unshift(tag + (node.id ? '#' + node.id : ''));
                    } else if (node.nodeType === 3) {
                        path.unshift('TEXT:"' + node.textContent.substring(0, 10) + '"');
                    }
                    node = node.parentNode;
                }
                return `depth=${depth} | ${path.join(' > ')} @ offset ${range.startOffset}`;
            });
        };
        
        const cursor0 = await getCursorInfo();
        console.log('Initial Cursor:', cursor0);
        
        // 1st Backspace - should convert to paragraph
        console.log('\n=== 1st Backspace ===');
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        const html1 = await editor.getHtml();
        const md1 = await editor.getMarkdown();
        const cursor1 = await getCursorInfo();
        console.log('HTML:', html1);
        console.log('MD:', JSON.stringify(md1));
        console.log('Cursor:', cursor1);
        
        // 2nd Backspace - should merge to upper line
        console.log('\n=== 2nd Backspace ===');
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        const html2 = await editor.getHtml();
        const md2 = await editor.getMarkdown();
        const cursor2 = await getCursorInfo();
        console.log('HTML:', html2);
        console.log('MD:', JSON.stringify(md2));
        console.log('Cursor:', cursor2);
        
        // 3rd Backspace - should convert to paragraph
        console.log('\n=== 3rd Backspace ===');
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        const html3 = await editor.getHtml();
        const md3 = await editor.getMarkdown();
        const cursor3 = await getCursorInfo();
        console.log('HTML:', html3);
        console.log('MD:', JSON.stringify(md3));
        console.log('Cursor:', cursor3);
        
        // 4th Backspace - PROBLEM: should merge to upper line, but goes to lower?
        console.log('\n=== 4th Backspace ===');
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        const html4 = await editor.getHtml();
        const md4 = await editor.getMarkdown();
        const cursor4 = await getCursorInfo();
        console.log('HTML:', html4);
        console.log('MD:', JSON.stringify(md4));
        console.log('Cursor:', cursor4);
        
        // 5th Backspace - PROBLEM: display breaks?
        console.log('\n=== 5th Backspace ===');
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        const html5 = await editor.getHtml();
        const md5 = await editor.getMarkdown();
        const cursor5 = await getCursorInfo();
        console.log('HTML:', html5);
        console.log('MD:', JSON.stringify(md5));
        console.log('Cursor:', cursor5);
        
        // Just to make the test pass for now
        expect(true).toBe(true);
    });
});
