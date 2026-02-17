import { test, expect } from '@playwright/test';

test.describe('Header + Enter + Codeblock creation', () => {
    test('Should create codeblock after pressing Enter at end of header', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(msg.text());
        });
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        // Type header
        await page.keyboard.type('### aaa');
        await page.keyboard.press('Space'); // Trigger header conversion
        await page.waitForTimeout(200);
        
        // Check header was created
        const afterHeader = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return editor.innerHTML;
        });
        console.log('After header creation:', afterHeader);
        
        // Press Enter at end of header
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        
        const afterEnter = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return editor.innerHTML;
        });
        console.log('After Enter:', afterEnter);
        
        // Type ``` to create codeblock
        await page.keyboard.type('```');
        await page.waitForTimeout(100);
        
        const beforeCodeblockEnter = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return editor.innerHTML;
        });
        console.log('Before codeblock Enter:', beforeCodeblockEnter);
        
        // Press Enter to trigger codeblock conversion
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                html: editor.innerHTML,
                hasCodeblock: editor.innerHTML.includes('<pre>') || editor.innerHTML.includes('<code'),
                hasPre: !!editor.querySelector('pre')
            };
        });
        
        console.log('Final HTML:', result.html);
        console.log('Has codeblock:', result.hasCodeblock);
        console.log('Console logs:', consoleLogs.filter(l => l.includes('[DEBUG]') || l.includes('pattern') || l.includes('code')));
        
        // Verify codeblock was created
        expect(result.hasPre).toBe(true);
    });
    
    test('Should create codeblock in normal paragraph (control test)', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        // Type ``` directly
        await page.keyboard.type('```');
        await page.waitForTimeout(100);
        
        // Press Enter to trigger codeblock conversion
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return {
                html: editor.innerHTML,
                hasPre: !!editor.querySelector('pre')
            };
        });
        
        console.log('Control test HTML:', result.html);
        
        // Verify codeblock was created
        expect(result.hasPre).toBe(true);
    });
    
    test('Debug: Check paragraph structure after header Enter', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        // Type header
        await page.keyboard.type('### aaa');
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
        
        // Press Enter
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        
        // Check the structure of the new paragraph
        const structure = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const sel = window.getSelection();
            const range = sel?.getRangeAt(0);
            const cursorNode = range?.startContainer;
            const cursorParent = cursorNode?.parentElement;
            
            // Get all child nodes of the paragraph
            let paragraphInfo = null;
            const paragraphs = editor.querySelectorAll('p');
            if (paragraphs.length > 0) {
                const lastP = paragraphs[paragraphs.length - 1];
                paragraphInfo = {
                    innerHTML: lastP.innerHTML,
                    textContent: lastP.textContent,
                    childNodesCount: lastP.childNodes.length,
                    childNodes: Array.from(lastP.childNodes).map(n => ({
                        nodeType: n.nodeType,
                        nodeName: n.nodeName,
                        textContent: n.textContent,
                        length: n.textContent?.length
                    }))
                };
            }
            
            return {
                editorHTML: editor.innerHTML,
                cursorNodeType: cursorNode?.nodeType,
                cursorNodeName: cursorNode?.nodeName,
                cursorParentTag: cursorParent?.tagName,
                cursorOffset: range?.startOffset,
                paragraphInfo
            };
        });
        
        console.log('Structure after Enter:', JSON.stringify(structure, null, 2));
        
        // Now type ```
        await page.keyboard.type('```');
        await page.waitForTimeout(100);
        
        const afterBackticks = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const sel = window.getSelection();
            const range = sel?.getRangeAt(0);
            const cursorNode = range?.startContainer;
            
            const paragraphs = editor.querySelectorAll('p');
            let lastPInfo = null;
            if (paragraphs.length > 0) {
                const lastP = paragraphs[paragraphs.length - 1];
                lastPInfo = {
                    innerHTML: lastP.innerHTML,
                    textContent: lastP.textContent,
                    textContentLength: lastP.textContent?.length,
                    childNodes: Array.from(lastP.childNodes).map(n => ({
                        nodeType: n.nodeType,
                        nodeName: n.nodeName,
                        textContent: n.textContent,
                        textContentCharCodes: n.textContent ? Array.from(n.textContent).map(c => c.charCodeAt(0)) : []
                    }))
                };
            }
            
            return {
                editorHTML: editor.innerHTML,
                cursorNodeTextContent: cursorNode?.textContent,
                cursorOffset: range?.startOffset,
                lastPInfo
            };
        });
        
        console.log('After typing ```:', JSON.stringify(afterBackticks, null, 2));
    });
});
