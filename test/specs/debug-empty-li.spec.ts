import { test, expect } from '@playwright/test';

test.describe('Debug empty li backspace', () => {
    test('Empty li with siblings - should convert to paragraph', async ({ page }) => {
        // Capture console logs
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });
        page.on('pageerror', error => {
            consoleLogs.push(`ERROR: ${error.message}`);
        });
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        // Set up the test HTML
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - ccc
            //   - dd
            //   - | (empty, cursor)
            //   - fff
            const initialHTML = '<ul><li>ccc<ul><li>dd</li><li><br></li><li>fff</li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            // Find the empty li (2nd li in nested ul)
            const nestedUl = document.querySelector('ul ul');
            const emptyLi = nestedUl.querySelectorAll('li')[1]; // 2nd li (empty)
            
            console.log('emptyLi.innerHTML:', emptyLi.innerHTML);
            console.log('emptyLi.textContent:', JSON.stringify(emptyLi.textContent));
            
            // Set cursor in the empty li
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            
            // Focus editor
            editor.focus();
            
            console.log('Before Backspace:', editor.innerHTML);
            
            // Dispatch Backspace keydown event
            const event = new KeyboardEvent('keydown', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true
            });
            
            const prevented = !editor.dispatchEvent(event);
            console.log('Event prevented:', prevented);
            
            console.log('After Backspace:', editor.innerHTML);
            
            return {
                before: initialHTML,
                after: editor.innerHTML,
                prevented: prevented
            };
        });
        
        // Print all console logs
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', result);
        
        // Expected: paragraph should be created
        expect(result.after).toContain('<p>');
    });
});
