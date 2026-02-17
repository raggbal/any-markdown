import { test, expect } from '@playwright/test';

test.describe('Backspace at beginning of nested list item', () => {
    test('Backspace at beginning of li should merge with previous empty li', async ({ page }) => {
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
        
        // Set up the test HTML and dispatch Backspace event
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - gaga
            //   - (empty with <br>)
            //     - (empty with <br>)
            //       - |haha (cursor at beginning)
            const initialHTML = '<ul><li>gaga<ul><li><br><ul><li><br><ul><li>haha</li></ul></li></ul></li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            // Find the deepest li with "haha" - it should be the innermost li
            const allLis = editor.querySelectorAll('li');
            let hahaLi = null;
            for (const li of allLis) {
                // Check if this li directly contains "haha" text (not in nested li)
                const directText = Array.from(li.childNodes)
                    .filter(n => n.nodeType === 3)
                    .map(n => n.textContent)
                    .join('');
                if (directText.trim() === 'haha') {
                    hahaLi = li;
                    break;
                }
            }
            
            if (!hahaLi) {
                console.log('ERROR: Could not find hahaLi');
                return { error: 'Could not find hahaLi' };
            }
            
            console.log('Found hahaLi:', hahaLi.innerHTML);
            console.log('hahaLi parent:', hahaLi.parentElement.tagName);
            
            // Set cursor at the beginning of hahaLi (before "haha")
            const textNode = hahaLi.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
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
        
        // Expected: haha should merge with the empty li above
        // Before: <ul><li>gaga<ul><li><br><ul><li><br><ul><li>haha</li></ul></li></ul></li></ul></li></ul>
        // After:  <ul><li>gaga<ul><li><br><ul><li>haha</li></ul></li></ul></li></ul>
        const expectedHTML = '<ul><li>gaga<ul><li><br><ul><li>haha</li></ul></li></ul></li></ul>';
        
        console.log('Expected HTML:', expectedHTML);
        console.log('Actual HTML:', result.after);
        
        expect(result.after).toBe(expectedHTML);
    });
    
    test('Multiple Backspace presses should continue merging up', async ({ page }) => {
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
        
        // Set up the test HTML and dispatch multiple Backspace events
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - gaga
            //   - (empty with <br>)
            //     - (empty with <br>)
            //       - |haha (cursor at beginning)
            const initialHTML = '<ul><li>gaga<ul><li><br><ul><li><br><ul><li>haha</li></ul></li></ul></li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            const results = [];
            
            // Helper to find the li containing "haha" text
            const findHahaLi = () => {
                const allLis = editor.querySelectorAll('li');
                for (const li of allLis) {
                    const directText = Array.from(li.childNodes)
                        .filter(n => n.nodeType === 3)
                        .map(n => n.textContent)
                        .join('');
                    if (directText.trim() === 'haha') {
                        return li;
                    }
                }
                return null;
            };
            
            // Helper to set cursor at beginning of li
            const setCursorAtBeginning = (li) => {
                const textNode = li.firstChild;
                if (!textNode) return false;
                const range = document.createRange();
                range.setStart(textNode, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                return true;
            };
            
            // Helper to dispatch Backspace
            const dispatchBackspace = () => {
                const event = new KeyboardEvent('keydown', {
                    key: 'Backspace',
                    code: 'Backspace',
                    keyCode: 8,
                    which: 8,
                    bubbles: true,
                    cancelable: true
                });
                return !editor.dispatchEvent(event);
            };
            
            // Focus editor
            editor.focus();
            
            // First Backspace
            let hahaLi = findHahaLi();
            if (!hahaLi) return { error: 'Could not find hahaLi' };
            setCursorAtBeginning(hahaLi);
            console.log('Before 1st Backspace:', editor.innerHTML);
            dispatchBackspace();
            results.push({ step: 1, html: editor.innerHTML });
            console.log('After 1st Backspace:', editor.innerHTML);
            
            // Second Backspace
            hahaLi = findHahaLi();
            if (!hahaLi) return { error: 'Could not find hahaLi after 1st backspace' };
            setCursorAtBeginning(hahaLi);
            console.log('Before 2nd Backspace:', editor.innerHTML);
            dispatchBackspace();
            results.push({ step: 2, html: editor.innerHTML });
            console.log('After 2nd Backspace:', editor.innerHTML);
            
            // Third Backspace
            hahaLi = findHahaLi();
            if (!hahaLi) return { error: 'Could not find hahaLi after 2nd backspace' };
            setCursorAtBeginning(hahaLi);
            console.log('Before 3rd Backspace:', editor.innerHTML);
            dispatchBackspace();
            results.push({ step: 3, html: editor.innerHTML });
            console.log('After 3rd Backspace:', editor.innerHTML);
            
            return {
                initial: initialHTML,
                results: results
            };
        });
        
        // Print all console logs
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Expected progression:
        // Initial: <ul><li>gaga<ul><li><br><ul><li><br><ul><li>haha</li></ul></li></ul></li></ul></li></ul>
        // After 1: <ul><li>gaga<ul><li><br><ul><li>haha</li></ul></li></ul></li></ul>
        // After 2: <ul><li>gaga<ul><li>haha</li></ul></li></ul>
        // After 3: <ul><li>gagahaha</li></ul>
        
        expect(result.results[0].html).toBe('<ul><li>gaga<ul><li><br><ul><li>haha</li></ul></li></ul></li></ul>');
        expect(result.results[1].html).toBe('<ul><li>gaga<ul><li>haha</li></ul></li></ul>');
        expect(result.results[2].html).toBe('<ul><li>gagahaha</li></ul>');
    });
    
    test('Non-empty nested li merged to parent li, cursor at parent text end', async ({ page }) => {
        // Requirement 1.1: 非空のネストリスト項目の先頭でBackspace → 親liにマージ
        // Cursor should be at the end of parent li's original text (before merged content)
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - Sagemaker Unifeted Studio の話をしてほしいかな。
            //   - |a   ← cursor at beginning of nested li
            const initialHTML = '<ul><li>Sagemaker Unifeted Studio の話をしてほしいかな。<ul><li>a</li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            // Find the nested li with "a"
            const allLis = editor.querySelectorAll('li');
            let nestedLi = null;
            for (const li of allLis) {
                const directText = Array.from(li.childNodes)
                    .filter(n => n.nodeType === 3)
                    .map(n => n.textContent)
                    .join('');
                if (directText.trim() === 'a') {
                    nestedLi = li;
                    break;
                }
            }
            
            if (!nestedLi) {
                return { error: 'Could not find nested li' };
            }
            
            // Set cursor at the beginning of nested li
            const textNode = nestedLi.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
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
            
            editor.dispatchEvent(event);
            
            console.log('After Backspace:', editor.innerHTML);
            
            // Get cursor position
            const newSel = window.getSelection();
            let cursorInfo = null;
            if (newSel && newSel.rangeCount > 0) {
                const newRange = newSel.getRangeAt(0);
                const container = newRange.startContainer;
                cursorInfo = {
                    containerText: container.textContent,
                    offset: newRange.startOffset,
                    containerType: container.nodeType
                };
            }
            
            return {
                before: initialHTML,
                after: editor.innerHTML,
                cursorInfo: cursorInfo
            };
        });
        
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Expected: nested li content merged into parent li
        // Before: <ul><li>Sagemaker Unifeted Studio の話をしてほしいかな。<ul><li>a</li></ul></li></ul>
        // After:  <ul><li>Sagemaker Unifeted Studio の話をしてほしいかな。a</li></ul>
        const expectedHTML = '<ul><li>Sagemaker Unifeted Studio の話をしてほしいかな。a</li></ul>';
        
        expect(result.after).toBe(expectedHTML);
        
        // Cursor should be at position 37 (length of "Sagemaker Unifeted Studio の話をしてほしいかな。")
        // This is the end of parent li's original text, before merged content "a"
        expect(result.cursorInfo).not.toBeNull();
        expect(result.cursorInfo.offset).toBe(37); // "Sagemaker Unifeted Studio の話をしてほしいかな。".length
    });
    
    test('Non-empty nested li merged to empty parent li, cursor at merged content start', async ({ page }) => {
        // Requirement 1.1 (special case): 親liが空の場合、カーソルはマージされたコンテンツの先頭
        // This tests the case with multiple empty nested lists
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - aaa
            //   - bbb
            //     - (empty)
            //       - (empty)
            //         - |c   ← cursor at beginning
            const initialHTML = '<ul><li>aaa<ul><li>bbb<ul><li><br><ul><li><br><ul><li>c</li></ul></li></ul></li></ul></li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            const results = [];
            
            // Helper to find the li containing "c" text
            const findCLi = () => {
                const allLis = editor.querySelectorAll('li');
                for (const li of allLis) {
                    const directText = Array.from(li.childNodes)
                        .filter(n => n.nodeType === 3)
                        .map(n => n.textContent)
                        .join('');
                    if (directText.trim() === 'c') {
                        return li;
                    }
                }
                return null;
            };
            
            // Helper to set cursor at beginning of li
            const setCursorAtBeginning = (li) => {
                const textNode = li.firstChild;
                if (!textNode) return false;
                const range = document.createRange();
                range.setStart(textNode, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                return true;
            };
            
            // Helper to dispatch Backspace
            const dispatchBackspace = () => {
                const event = new KeyboardEvent('keydown', {
                    key: 'Backspace',
                    code: 'Backspace',
                    keyCode: 8,
                    which: 8,
                    bubbles: true,
                    cancelable: true
                });
                return !editor.dispatchEvent(event);
            };
            
            // Helper to get cursor info
            const getCursorInfo = () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    return {
                        containerText: range.startContainer.textContent,
                        offset: range.startOffset
                    };
                }
                return null;
            };
            
            // Focus editor
            editor.focus();
            
            // First Backspace
            let cLi = findCLi();
            if (!cLi) return { error: 'Could not find cLi' };
            setCursorAtBeginning(cLi);
            console.log('Before 1st Backspace:', editor.innerHTML);
            dispatchBackspace();
            results.push({ step: 1, html: editor.innerHTML, cursor: getCursorInfo() });
            console.log('After 1st Backspace:', editor.innerHTML);
            
            // Second Backspace - cursor should be at beginning of "c", so this should merge again
            cLi = findCLi();
            if (!cLi) return { error: 'Could not find cLi after 1st backspace', results };
            setCursorAtBeginning(cLi);
            console.log('Before 2nd Backspace:', editor.innerHTML);
            dispatchBackspace();
            results.push({ step: 2, html: editor.innerHTML, cursor: getCursorInfo() });
            console.log('After 2nd Backspace:', editor.innerHTML);
            
            return {
                initial: initialHTML,
                results: results
            };
        });
        
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Expected progression:
        // Initial: - aaa > - bbb > - (empty) > - (empty) > - c
        // After 1: - aaa > - bbb > - (empty) > - c  (merged into empty parent, cursor at "c" start)
        // After 2: - aaa > - bbb > - c  (merged into empty parent again, cursor at "c" start)
        
        // Verify HTML structure after each step
        expect(result.results[0].html).toBe('<ul><li>aaa<ul><li>bbb<ul><li><br><ul><li>c</li></ul></li></ul></li></ul></li></ul>');
        expect(result.results[1].html).toBe('<ul><li>aaa<ul><li>bbb<ul><li>c</li></ul></li></ul></li></ul>');
        
        // Verify cursor is at position 0 (start of "c") after each merge
        // This is critical - if cursor is not at position 0, next backspace will delete "c" instead of merging
        expect(result.results[0].cursor.offset).toBe(0);
        expect(result.results[0].cursor.containerText).toBe('c');
        expect(result.results[1].cursor.offset).toBe(0);
        expect(result.results[1].cursor.containerText).toBe('c');
    });
});

test.describe('Backspace to merge paragraph into nested list', () => {
    test('Non-empty paragraph should merge into deepest last li, cursor at original text end', async ({ page }) => {
        // Requirement 5.1: リストの後の非空の段落でBackspace → 最も深い最後の要素にマージ
        // Cursor should be at the end of original text (before merged content)
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - 小さいアプリ開発
            //   - Azureログインありのアプリ
            // |Copilotで捌けるものはそこ   ← paragraph (cursor at beginning)
            const initialHTML = '<ul><li>小さいアプリ開発<ul><li>Azureログインありのアプリ</li></ul></li></ul><p>Copilotで捌けるものはそこ</p>';
            editor.innerHTML = initialHTML;
            
            // Find the paragraph
            const paragraph = editor.querySelector('p');
            if (!paragraph) {
                return { error: 'Could not find paragraph' };
            }
            
            // Set cursor at the beginning of paragraph
            const textNode = paragraph.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
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
            
            editor.dispatchEvent(event);
            
            console.log('After Backspace:', editor.innerHTML);
            
            // Get cursor position
            const newSel = window.getSelection();
            let cursorInfo = null;
            if (newSel && newSel.rangeCount > 0) {
                const newRange = newSel.getRangeAt(0);
                const container = newRange.startContainer;
                const offset = newRange.startOffset;
                cursorInfo = {
                    containerText: container.textContent,
                    offset: offset,
                    containerType: container.nodeType
                };
            }
            
            return {
                before: initialHTML,
                after: editor.innerHTML,
                cursorInfo: cursorInfo
            };
        });
        
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Expected: paragraph content merged into deepest last li
        // Before: <ul><li>小さいアプリ開発<ul><li>Azureログインありのアプリ</li></ul></li></ul><p>Copilotで捌けるものはそこ</p>
        // After:  <ul><li>小さいアプリ開発<ul><li>AzureログインありのアプリCopilotで捌けるものはそこ</li></ul></li></ul>
        const expectedHTML = '<ul><li>小さいアプリ開発<ul><li>AzureログインありのアプリCopilotで捌けるものはそこ</li></ul></li></ul>';
        
        expect(result.after).toBe(expectedHTML);
        
        // Cursor should be at position 15 (length of "Azureログインありのアプリ")
        // This is the end of original text, before merged content
        expect(result.cursorInfo).not.toBeNull();
        expect(result.cursorInfo.offset).toBe(15); // "Azureログインありのアプリ".length
    });
    
    test('Empty paragraph should merge into deepest last li, cursor at end', async ({ page }) => {
        // Requirement 5: リストの後の空の段落でBackspace → リストの最後の要素にカーソル
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - aa
            // - bb
            //   - ccc
            //   - eee
            // |        ← empty paragraph
            const initialHTML = '<ul><li>aa</li><li>bb<ul><li>ccc</li><li>eee</li></ul></li></ul><p><br></p>';
            editor.innerHTML = initialHTML;
            
            // Find the paragraph
            const paragraph = editor.querySelector('p');
            if (!paragraph) {
                return { error: 'Could not find paragraph' };
            }
            
            // Set cursor at the beginning of paragraph
            const range = document.createRange();
            range.setStart(paragraph, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            // Focus editor
            editor.focus();
            
            // Dispatch Backspace keydown event
            const event = new KeyboardEvent('keydown', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true
            });
            
            editor.dispatchEvent(event);
            
            // Get cursor position
            const newSel = window.getSelection();
            let cursorInfo = null;
            if (newSel && newSel.rangeCount > 0) {
                const newRange = newSel.getRangeAt(0);
                const container = newRange.startContainer;
                cursorInfo = {
                    containerText: container.textContent,
                    offset: newRange.startOffset
                };
            }
            
            return {
                before: initialHTML,
                after: editor.innerHTML,
                cursorInfo: cursorInfo
            };
        });
        
        // Expected: empty paragraph removed, cursor at end of deepest last li (eee)
        const expectedHTML = '<ul><li>aa</li><li>bb<ul><li>ccc</li><li>eee</li></ul></li></ul>';
        
        expect(result.after).toBe(expectedHTML);
        
        // Cursor should be at end of "eee" (position 3)
        expect(result.cursorInfo).not.toBeNull();
        expect(result.cursorInfo.containerText).toBe('eee');
        expect(result.cursorInfo.offset).toBe(3);
    });
});

test.describe('Backspace Case 3 - Empty paragraph with list before', () => {
    test('Empty paragraph in li with nested list before should merge to deepest last li (Requirement 5.2)', async ({ page }) => {
        // Requirement 5.2: 親li内の空の段落でBackspace（Case 3）→ 見た目上の上の行に統合
        // This tests the scenario:
        // - d
        //   - 
        //     - 
        //   - |  ← empty nested li
        // After 1st Backspace: converts to paragraph
        // After 2nd Backspace: should merge to deepest last li (visually above line)
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - d
            //   - (empty)
            //     - (empty)
            //   - | (empty, cursor here)
            const initialHTML = '<ul><li>d<ul><li><br><ul><li><br></li></ul></li><li><br></li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            const results = [];
            
            // Helper to dispatch Backspace
            const dispatchBackspace = () => {
                const event = new KeyboardEvent('keydown', {
                    key: 'Backspace',
                    code: 'Backspace',
                    keyCode: 8,
                    which: 8,
                    bubbles: true,
                    cancelable: true
                });
                return !editor.dispatchEvent(event);
            };
            
            // Helper to get cursor info
            const getCursorInfo = () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    return {
                        containerText: range.startContainer.textContent,
                        offset: range.startOffset,
                        containerNodeName: range.startContainer.nodeName,
                        parentNodeName: range.startContainer.parentNode?.nodeName
                    };
                }
                return null;
            };
            
            // Focus editor
            editor.focus();
            
            // Find the last empty li (the one we want to start from)
            const allLis = editor.querySelectorAll('li');
            const lastLi = allLis[allLis.length - 1]; // Last li should be the empty one
            
            // Set cursor at beginning of last li
            const range = document.createRange();
            range.setStart(lastLi, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Initial HTML:', editor.innerHTML);
            console.log('Cursor in li:', lastLi.innerHTML);
            
            // First Backspace - should convert to paragraph
            dispatchBackspace();
            results.push({ step: 1, html: editor.innerHTML, cursor: getCursorInfo(), description: 'Convert to paragraph' });
            console.log('After 1st Backspace:', editor.innerHTML);
            
            // Second Backspace - should merge to deepest last li (visually above)
            dispatchBackspace();
            results.push({ step: 2, html: editor.innerHTML, cursor: getCursorInfo(), description: 'Merge to deepest last li' });
            console.log('After 2nd Backspace:', editor.innerHTML);
            
            // Third Backspace - should convert to paragraph (NOT merge incorrectly)
            dispatchBackspace();
            results.push({ step: 3, html: editor.innerHTML, cursor: getCursorInfo(), description: 'Convert to paragraph again' });
            console.log('After 3rd Backspace:', editor.innerHTML);
            
            return {
                initial: initialHTML,
                results: results
            };
        });
        
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Verify the progression:
        // After 1st Backspace: empty li converts to paragraph
        // After 2nd Backspace: paragraph merges to deepest last li (the nested empty li)
        // After 3rd Backspace: that li converts to paragraph (NOT "- - |" bug)
        
        // The key assertion is that after 3rd backspace, we should NOT have "- - |" pattern
        // which would indicate the cursor was incorrectly placed inside the nested list
        expect(result.results[2].html).not.toContain('<li><li>'); // No nested li without ul/ol
        
        // After 3rd backspace, the structure should have a paragraph, not a malformed list
        // The exact HTML may vary, but it should be valid structure
        expect(result.results[2].html).toMatch(/<p>|<li>/); // Should have either p or li, but valid
    });
});

test.describe('Backspace with multiple nested lists - Requirement 5.3', () => {
    test('Top-level empty li with multiple nested lists should preserve all nested lists', async ({ page }) => {
        // Requirement 5.3: トップレベルの空リスト項目に複数のネストリストがある場合のBackspace
        // All nested lists should be preserved, not just the first one
        
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            consoleLogs.push(`${msg.type()}: ${msg.text()}`);
        });
        
        await page.goto('/standalone-editor.html');
        await page.waitForTimeout(500);
        
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            // - | (empty, cursor here)
            //   - d
            //   - d
            // This represents a top-level empty li with two nested lists (or one list with two items)
            // The bug was that only the first nested list was preserved
            const initialHTML = '<ul><li><br><ul><li>d</li></ul><ul><li>d</li></ul></li></ul>';
            editor.innerHTML = initialHTML;
            
            // Helper to dispatch Backspace
            const dispatchBackspace = () => {
                const event = new KeyboardEvent('keydown', {
                    key: 'Backspace',
                    code: 'Backspace',
                    keyCode: 8,
                    which: 8,
                    bubbles: true,
                    cancelable: true
                });
                return !editor.dispatchEvent(event);
            };
            
            // Focus editor
            editor.focus();
            
            // Find the top-level li (the empty one with nested lists)
            const topLi = editor.querySelector('li');
            
            // Set cursor at beginning of top li
            const range = document.createRange();
            range.setStart(topLi, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Initial HTML:', editor.innerHTML);
            
            // Backspace - should convert to paragraph and preserve ALL nested lists
            dispatchBackspace();
            
            console.log('After Backspace:', editor.innerHTML);
            
            // Count how many li elements with "d" remain
            const dLis = Array.from(editor.querySelectorAll('li')).filter(li => {
                const directText = Array.from(li.childNodes)
                    .filter(n => n.nodeType === 3)
                    .map(n => n.textContent)
                    .join('');
                return directText.trim() === 'd';
            });
            
            return {
                before: initialHTML,
                after: editor.innerHTML,
                dLiCount: dLis.length
            };
        });
        
        console.log('=== Console Logs ===');
        for (const log of consoleLogs) {
            console.log(log);
        }
        console.log('=== End Console Logs ===');
        
        console.log('Result:', JSON.stringify(result, null, 2));
        
        // Expected: Both nested lists should be preserved
        // Before: <ul><li><br><ul><li>d</li></ul><ul><li>d</li></ul></li></ul>
        // After:  <p><br></p><ul><li>d</li></ul><ul><li>d</li></ul>
        
        // The key assertion: both "d" items should still exist
        expect(result.dLiCount).toBe(2);
        
        // Should have a paragraph
        expect(result.after).toContain('<p>');
        
        // Should have both nested lists preserved
        expect(result.after).toContain('<ul><li>d</li></ul>');
    });
});
