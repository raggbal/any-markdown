import { test, expect } from '@playwright/test';

test.describe('Inline pattern conversion - Space removal', () => {
    test('Bold pattern: **text** + Space should not leave trailing space', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]') || msg.text().includes('[PATTERN]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // Wait for editor to be ready
        await page.waitForSelector('#editor');
        
        // Focus editor and type using Playwright's keyboard
        await page.click('#editor');
        await page.keyboard.type('**bold**');
        
        // Get HTML before space
        const beforeSpace = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            return editor.innerHTML;
        });
        
        // Press Space to trigger conversion
        await page.keyboard.press('Space');
        
        // Wait for conversion
        await page.waitForTimeout(300);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = editor.textContent || '';
            
            return {
                html: editor.innerHTML,
                textContent,
                hasTrailingSpace: textContent.endsWith(' ') || textContent.includes('bold '),
                hasBoldTag: editor.innerHTML.includes('<strong>') || editor.innerHTML.includes('<b>')
            };
        });
        
        console.log('Console logs:', consoleLogs);
        console.log('Before Space:', beforeSpace);
        console.log('After Space:', result.html);
        console.log('Text content:', JSON.stringify(result.textContent));
        console.log('Has trailing space:', result.hasTrailingSpace);
        console.log('Has bold tag:', result.hasBoldTag);
        
        // Verify bold conversion happened
        expect(result.hasBoldTag).toBe(true);
        
        // Verify no trailing space after conversion
        expect(result.hasTrailingSpace).toBe(false);
    });
    
    test('Bold pattern: typing after conversion should be normal text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        // Type **bold** and press Space to convert
        await page.keyboard.type('**bold**');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        // Type additional text after conversion
        await page.keyboard.type('normal');
        await page.waitForTimeout(100);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const strongElement = editor.querySelector('strong');
            const strongText = strongElement ? strongElement.textContent : '';
            
            return {
                html: editor.innerHTML,
                textContent: editor.textContent || '',
                strongText,
                // Check if "normal" is inside <strong> tag
                normalInsideStrong: strongElement ? strongElement.textContent?.includes('normal') : false
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Text content:', result.textContent);
        console.log('Strong text:', result.strongText);
        console.log('Normal inside strong:', result.normalInsideStrong);
        
        // "normal" should NOT be inside <strong> tag
        expect(result.normalInsideStrong).toBe(false);
        // The strong element should only contain "bold"
        expect(result.strongText).toBe('bold');
    });
    
    test('Italic pattern: *text* + Space should not leave trailing space', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        await page.keyboard.type('*italic*');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = editor.textContent || '';
            
            return {
                html: editor.innerHTML,
                textContent,
                hasTrailingSpace: textContent.endsWith(' ') || textContent.includes('italic '),
                hasItalicTag: editor.innerHTML.includes('<em>') || editor.innerHTML.includes('<i>')
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Text content:', JSON.stringify(result.textContent));
        
        expect(result.hasItalicTag).toBe(true);
        expect(result.hasTrailingSpace).toBe(false);
    });
    
    test('Italic pattern: typing after conversion should be normal text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        await page.keyboard.type('*italic*');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        await page.keyboard.type('normal');
        await page.waitForTimeout(100);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const emElement = editor.querySelector('em');
            const emText = emElement ? emElement.textContent : '';
            
            return {
                html: editor.innerHTML,
                emText,
                normalInsideEm: emElement ? emElement.textContent?.includes('normal') : false
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Em text:', result.emText);
        
        expect(result.normalInsideEm).toBe(false);
        expect(result.emText).toBe('italic');
    });
    
    test('Inline code pattern: `code` + Space should not leave trailing space', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        await page.keyboard.type('`code`');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = editor.textContent || '';
            
            return {
                html: editor.innerHTML,
                textContent,
                hasTrailingSpace: textContent.endsWith(' ') || textContent.includes('code '),
                hasCodeTag: editor.innerHTML.includes('<code>')
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Text content:', JSON.stringify(result.textContent));
        
        expect(result.hasCodeTag).toBe(true);
        expect(result.hasTrailingSpace).toBe(false);
    });
    
    test('Inline code pattern: typing after conversion should be normal text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        await page.keyboard.type('`code`');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        await page.keyboard.type('normal');
        await page.waitForTimeout(100);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const codeElement = editor.querySelector('code');
            const codeText = codeElement ? codeElement.textContent : '';
            
            return {
                html: editor.innerHTML,
                codeText,
                normalInsideCode: codeElement ? codeElement.textContent?.includes('normal') : false
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Code text:', result.codeText);
        
        expect(result.normalInsideCode).toBe(false);
        expect(result.codeText).toBe('code');
    });
    
    test('Strikethrough pattern: ~~text~~ + Space should not leave trailing space', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        await page.keyboard.type('~~strike~~');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const textContent = editor.textContent || '';
            
            return {
                html: editor.innerHTML,
                textContent,
                hasTrailingSpace: textContent.endsWith(' ') || textContent.includes('strike '),
                hasStrikeTag: editor.innerHTML.includes('<del>') || editor.innerHTML.includes('<s>')
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Text content:', JSON.stringify(result.textContent));
        
        expect(result.hasStrikeTag).toBe(true);
        expect(result.hasTrailingSpace).toBe(false);
    });
    
    test('Strikethrough pattern: typing after conversion should be normal text', async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        
        await page.waitForSelector('#editor');
        await page.click('#editor');
        
        await page.keyboard.type('~~strike~~');
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
        
        await page.keyboard.type('normal');
        await page.waitForTimeout(100);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor') as HTMLDivElement;
            const delElement = editor.querySelector('del');
            const delText = delElement ? delElement.textContent : '';
            
            return {
                html: editor.innerHTML,
                delText,
                normalInsideDel: delElement ? delElement.textContent?.includes('normal') : false
            };
        });
        
        console.log('HTML:', result.html);
        console.log('Del text:', result.delText);
        
        expect(result.normalInsideDel).toBe(false);
        expect(result.delText).toBe('strike');
    });
});
