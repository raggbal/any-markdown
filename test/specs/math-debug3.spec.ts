import { test, expect } from '@playwright/test';

test('Debug math block', async ({ page }) => {
    await page.goto('http://localhost:3000/standalone-editor.html');
    await page.waitForSelector('#editor', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => window.__testApi?.ready === true, { timeout: 5000 });

    // Test 1: Single-line math - initial DOM
    await page.evaluate(() => {
        window.__testApi.setMarkdown('Above\n\n```math\nE = mc^2\n```\n\nBelow\n');
    });
    await page.waitForTimeout(500);

    const t1 = await page.evaluate(() => {
        const w = document.querySelector('.math-wrapper');
        const c = w?.querySelector('code');
        return { html: c?.innerHTML, nodes: Array.from(c?.childNodes||[]).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName) };
    });
    console.log('T1 initial:', JSON.stringify(t1));

    // Test 2: After sync cycle
    const md1 = await page.evaluate(() => JSON.stringify(window.__testApi.getMarkdown()));
    console.log('T2 md:', md1);
    
    await page.evaluate(() => { window.__testApi.setMarkdown(window.__testApi.getMarkdown()); });
    await page.waitForTimeout(500);

    const t2 = await page.evaluate(() => {
        const w = document.querySelector('.math-wrapper');
        const c = w?.querySelector('code');
        return { html: c?.innerHTML, nodes: Array.from(c?.childNodes||[]).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName) };
    });
    console.log('T2 after sync:', JSON.stringify(t2));

    // Test 3: With trailing empty line
    await page.evaluate(() => {
        window.__testApi.setMarkdown('Above\n\n```math\nE = mc^2\n\n```\n\nBelow\n');
    });
    await page.waitForTimeout(500);

    const t3 = await page.evaluate(() => {
        const w = document.querySelector('.math-wrapper');
        const c = w?.querySelector('code');
        return { html: c?.innerHTML, nodes: Array.from(c?.childNodes||[]).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName) };
    });
    console.log('T3 trailing empty:', JSON.stringify(t3));

    // Test 4: setCursorToLastLineStart on single-line (no BR, no \n)
    await page.evaluate(() => {
        window.__testApi.setMarkdown('Above\n\n```math\nE = mc^2\n```\n\nBelow\n');
    });
    await page.waitForTimeout(500);

    const t4 = await page.evaluate(() => {
        const w = document.querySelector('.math-wrapper');
        const c = w?.querySelector('pre[data-lang="math"] code');
        w.setAttribute('data-mode', 'edit');
        c.focus();
        
        const before = Array.from(c.childNodes).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName);
        window.__testApi.setCursorToLastLineStart(c);
        const after = Array.from(c.childNodes).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName);
        
        const sel = window.getSelection();
        const r = sel.rangeCount>0?sel.getRangeAt(0):null;
        return {
            before, after,
            cursorNode: r?.startContainer?.nodeType===3?'T:"'+r.startContainer.textContent+'"':r?.startContainer?.nodeName,
            cursorOffset: r?.startOffset
        };
    });
    console.log('T4 setCursorToLastLineStart single-line:', JSON.stringify(t4));

    // Test 5: setCursorToLastLineStart on multi-line (has BR)
    await page.evaluate(() => {
        window.__testApi.setMarkdown('Above\n\n```math\nE = mc^2\nx^2 = 1\n```\n\nBelow\n');
    });
    await page.waitForTimeout(500);

    const t5 = await page.evaluate(() => {
        const w = document.querySelector('.math-wrapper');
        const c = w?.querySelector('pre[data-lang="math"] code');
        w.setAttribute('data-mode', 'edit');
        c.focus();
        
        const before = Array.from(c.childNodes).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName);
        window.__testApi.setCursorToLastLineStart(c);
        const after = Array.from(c.childNodes).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName);
        
        const sel = window.getSelection();
        const r = sel.rangeCount>0?sel.getRangeAt(0):null;
        return {
            before, after,
            cursorNode: r?.startContainer?.nodeType===3?'T:"'+r.startContainer.textContent+'"':r?.startContainer?.nodeName,
            cursorOffset: r?.startOffset
        };
    });
    console.log('T5 setCursorToLastLineStart multi-line:', JSON.stringify(t5));

    // Test 6: with trailing BR (from trailing empty line)
    await page.evaluate(() => {
        window.__testApi.setMarkdown('Above\n\n```math\nE = mc^2\n\n```\n\nBelow\n');
    });
    await page.waitForTimeout(500);

    const t6 = await page.evaluate(() => {
        const w = document.querySelector('.math-wrapper');
        const c = w?.querySelector('pre[data-lang="math"] code');
        w.setAttribute('data-mode', 'edit');
        c.focus();
        
        const before = Array.from(c.childNodes).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName);
        window.__testApi.setCursorToLastLineStart(c);
        const after = Array.from(c.childNodes).map(n=>n.nodeType===3?'T:"'+n.textContent+'"':n.nodeName);
        
        const sel = window.getSelection();
        const r = sel.rangeCount>0?sel.getRangeAt(0):null;
        return {
            before, after,
            cursorNode: r?.startContainer?.nodeType===3?'T:"'+r.startContainer.textContent+'"':r?.startContainer?.nodeName,
            cursorOffset: r?.startOffset
        };
    });
    console.log('T6 setCursorToLastLineStart with trailing BR:', JSON.stringify(t6));

    expect(true).toBe(true);
});
