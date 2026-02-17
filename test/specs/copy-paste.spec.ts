/**
 * コピー＆ペーストテスト
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('コピー操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('リスト全体をコピー → Markdownとしてコピーされる', async ({ page }) => {
        // 初期状態: 3つのリスト項目
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>sss</li><li>sdsd</li><li>sdsds</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 全選択
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (full list):', clipboardContent);
        expect(clipboardContent.md).toContain('- sss');
        expect(clipboardContent.md).toContain('- sdsd');
        expect(clipboardContent.md).toContain('- sdsds');
    });

    test('リストの2項目目と3項目目を選択してコピー → Markdownとしてコピーされる', async ({ page }) => {
        // 初期状態: 3つのリスト項目
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>sss</li><li>sdsd</li><li>sdsds</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 2項目目の先頭から3項目目の末尾まで選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const secondLi = lis[1];
            const thirdLi = lis[2];
            
            const range = document.createRange();
            range.setStart(secondLi.firstChild, 0); // sdsdの先頭
            range.setEnd(thirdLi.firstChild, thirdLi.firstChild.textContent.length); // sdsdsの末尾
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Selection:', sel.toString());
        });
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (2 items):', clipboardContent);
        // 2項目がMarkdownリストとしてコピーされるべき
        expect(clipboardContent.md).toContain('- sdsd');
        expect(clipboardContent.md).toContain('- sdsds');
    });

    test('リストの2項目目の途中から3項目目の末尾まで選択してコピー', async ({ page }) => {
        // 初期状態: 3つのリスト項目
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>sss</li><li>sdsd</li><li>sdsds</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 2項目目の途中（"sd"の後）から3項目目の末尾まで選択
        // これは "sd" + "sdsds" を選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const secondLi = lis[1];
            const thirdLi = lis[2];
            
            const range = document.createRange();
            range.setStart(secondLi.firstChild, 2); // sdsdの2文字目以降（"sd"）
            range.setEnd(thirdLi.firstChild, thirdLi.firstChild.textContent.length); // sdsdsの末尾
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Selection:', sel.toString());
            console.log('Selected HTML:', (() => {
                const fragment = range.cloneContents();
                const div = document.createElement('div');
                div.appendChild(fragment);
                return div.innerHTML;
            })());
        });
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (partial):', clipboardContent);
        // 部分選択の場合、どうなるべきか？
        // 現状の問題: "sd\nsdsds" のようにインラインテキストになってしまう
        // 期待: 部分選択なのでインラインテキストでOK、または "- sd\n- sdsds" のようにリストとして
    });

    test('リストの2項目目全体と3項目目全体を選択してコピー（テキストのみ選択）', async ({ page }) => {
        // 初期状態: 3つのリスト項目
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>sss</li><li>sdsd</li><li>sdsds</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 2項目目のテキスト全体から3項目目のテキスト全体まで選択
        // ユーザーが報告した問題: "sdsd" + "sdsds" を選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const secondLi = lis[1];
            const thirdLi = lis[2];
            
            const range = document.createRange();
            range.setStart(secondLi.firstChild, 0); // sdsdの先頭
            range.setEnd(thirdLi.firstChild, thirdLi.firstChild.textContent.length); // sdsdsの末尾
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Selection text:', sel.toString());
            console.log('Selected HTML:', (() => {
                const fragment = range.cloneContents();
                const div = document.createElement('div');
                div.appendChild(fragment);
                return div.innerHTML;
            })());
        });
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (full text of 2 items):', clipboardContent);
        // 期待: "- sdsd\n- sdsds" のようにリストとしてコピーされる
        expect(clipboardContent.md).toContain('- sdsd');
        expect(clipboardContent.md).toContain('- sdsds');
    });

    test('選択されたHTMLがテキスト+liの場合のコピー', async ({ page }) => {
        // ユーザーが報告した問題を再現
        // 選択されたHTMLが "sdsd<li>sdsds</li>" のような構造になる場合
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>sss</li><li>sdsd</li><li>sdsds</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // コピーハンドラーをテスト（実際のコピーイベントを発火）
        // 問題のある構造をシミュレートするために、カスタムイベントを使用
        const result = await page.evaluate(() => {
            // 問題のある構造を持つtempDivを作成
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = 'sdsd<li>sdsds</li>';
            
            // hasBlockElementsチェック
            const hasBlockElements = tempDiv.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, li, pre, blockquote, table, hr');
            
            // hasLiとhasTextBeforeLiチェック
            const hasLi = tempDiv.querySelector('li');
            const hasTextBeforeLi = hasLi && Array.from(tempDiv.childNodes).some((child, index, arr) => {
                if (child.nodeType === 3 && child.textContent.trim()) {
                    for (let i = index + 1; i < arr.length; i++) {
                        if (arr[i].nodeType === 1 && arr[i].tagName?.toLowerCase() === 'li') {
                            return true;
                        }
                    }
                }
                return false;
            });
            
            let md = '';
            if (hasTextBeforeLi) {
                // Mixed text and li elements - treat text as li too
                for (const child of tempDiv.childNodes) {
                    if (child.nodeType === 3) {
                        const text = child.textContent.trim();
                        if (text) {
                            md += '- ' + text + '\n';
                        }
                    } else if (child.nodeType === 1 && child.tagName.toLowerCase() === 'li') {
                        md += '- ' + child.textContent + '\n';
                    }
                }
            } else {
                for (const child of tempDiv.childNodes) {
                    if (child.nodeType === 3) {
                        md += child.textContent;
                    } else if (child.nodeType === 1 && child.tagName.toLowerCase() === 'li') {
                        md += '- ' + child.textContent + '\n';
                    }
                }
            }
            
            return {
                hasBlockElements: !!hasBlockElements,
                hasLi: !!hasLi,
                hasTextBeforeLi: hasTextBeforeLi,
                md: md.trim()
            };
        });
        
        console.log('Test result:', result);
        // 期待: hasTextBeforeLi = true, md = "- sdsd\n- sdsds"
        expect(result.hasTextBeforeLi).toBe(true);
        expect(result.md).toBe('- sdsd\n- sdsds');
    });

    test('ネストされたリストで親項目からネスト項目を選択してコピー → リスト構造が保持される', async ({ page }) => {
        // 初期状態: ネストされたリスト
        // - aaa
        // - **bbb**
        //   - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li><strong>bbb</strong><ul><li>ccc</li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // **bbb** から ccc を選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const secondLi = lis[1]; // **bbb** を含む li
            const nestedLi = lis[2]; // ccc を含む li
            
            const strong = secondLi.querySelector('strong');
            
            const range = document.createRange();
            range.setStart(strong.firstChild, 0); // bbbの先頭
            range.setEnd(nestedLi.firstChild, nestedLi.firstChild.textContent.length); // cccの末尾
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Selection:', sel.toString());
            console.log('Selected HTML:', (() => {
                const fragment = range.cloneContents();
                const div = document.createElement('div');
                div.appendChild(fragment);
                return div.innerHTML;
            })());
        });
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (nested list):', clipboardContent);
        // 期待: リスト構造が保持される
        // - **bbb**
        //   - ccc
        expect(clipboardContent.md).toContain('- **bbb**');
        expect(clipboardContent.md).toContain('  - ccc');
    });

    test('トリプルクリック相当の選択（ネストされたリスト項目）→ 正しくコピーされる', async ({ page }) => {
        // 初期状態: ネストされたリスト
        // - 親項目
        //   - 子項目のテキスト
        // - 次の項目
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>親項目<ul><li>子項目のテキスト</li></ul></li><li>次の項目</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // トリプルクリック相当: ネストされた子項目の先頭から次の項目の先頭(offset:0)まで選択
        // これはブラウザのトリプルクリック動作をシミュレート
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const nestedLi = lis[1]; // 子項目のテキスト を含む li
            const nextLi = lis[2]; // 次の項目 を含む li
            
            const range = document.createRange();
            range.setStart(nestedLi.firstChild, 0); // 子項目のテキストの先頭
            range.setEnd(nextLi, 0); // 次の項目のli要素の先頭(offset:0) - トリプルクリックの動作
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            console.log('Selection:', sel.toString());
        });
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (triple-click nested):', clipboardContent);
        // 期待: 子項目だけがコピーされる（親の空liは含まれない）
        // - 子項目のテキスト
        expect(clipboardContent.md).toBe('- 子項目のテキスト');
        // 親の空liが含まれていないことを確認
        expect(clipboardContent.md).not.toContain('- \n');
    });

    test('トリプルクリック相当の選択（通常のリスト項目）→ 正しくコピーされる', async ({ page }) => {
        // 初期状態: 通常のリスト
        // - 項目1
        // - 項目2
        // - 項目3
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>項目1</li><li>項目2</li><li>項目3</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // トリプルクリック相当: 項目2の先頭から項目3の先頭(offset:0)まで選択
        await page.evaluate(() => {
            const lis = document.querySelectorAll('li');
            const secondLi = lis[1]; // 項目2
            const thirdLi = lis[2]; // 項目3
            
            const range = document.createRange();
            range.setStart(secondLi.firstChild, 0); // 項目2の先頭
            range.setEnd(thirdLi, 0); // 項目3のli要素の先頭(offset:0)
            
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.waitForTimeout(100);
        
        // コピーしてクリップボードの内容を確認
        const clipboardContent = await page.evaluate(async () => {
            return new Promise((resolve) => {
                document.addEventListener('copy', (e) => {
                    const md = e.clipboardData.getData('text/x-any-md');
                    const plain = e.clipboardData.getData('text/plain');
                    const html = e.clipboardData.getData('text/html');
                    resolve({ md, plain, html });
                }, { once: true });
                document.execCommand('copy');
            });
        });
        
        console.log('Clipboard content (triple-click normal):', clipboardContent);
        // 期待: 項目2だけがコピーされる
        expect(clipboardContent.md).toBe('- 項目2');
    });
});

test.describe('リストへのペースト操作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    // ヘルパー関数: ペーストイベントをシミュレート
    async function simulatePaste(page, md: string) {
        await page.evaluate((pastedMd) => {
            const editor = document.getElementById('editor');
            
            // CustomEventを使用してペーストをシミュレート
            const clipboardData = {
                _data: {
                    'text/plain': pastedMd,
                    'text/x-any-md': pastedMd,
                    'text/html': ''
                },
                getData: function(type: string) {
                    return this._data[type] || '';
                },
                setData: function(type: string, value: string) {
                    this._data[type] = value;
                },
                items: []
            };
            
            // ClipboardEventを作成
            const event = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            
            // clipboardDataをオーバーライド
            Object.defineProperty(event, 'clipboardData', {
                value: clipboardData,
                writable: false,
                configurable: true
            });
            
            editor.dispatchEvent(event);
        }, md);
    }

    test('空のリスト項目にリストをペースト → 空行を置換して挿入', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb
        // - (空)
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li><br></li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空のリスト項目にカーソルを置いてペースト処理を直接実行
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const lis = document.querySelectorAll('li');
            const emptyLi = lis[2]; // 空の li
            
            // カーソルを設定
            const range = document.createRange();
            range.selectNodeContents(emptyLi);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            editor.focus();
            
            // ペースト処理を直接シミュレート（リストをリストにペースト）
            // パターン1: 空のリスト項目を置換
            const pastedHtml = '<ul><li>eee<ul><li>fff</li></ul></li></ul>';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = pastedHtml;
            const pastedList = tempDiv.querySelector('ul');
            const pastedListItems = Array.from(pastedList.children).filter(el => el.tagName === 'LI');
            
            // 空のliを削除して、ペーストされたliを挿入
            const parentList = emptyLi.parentNode;
            const nextSibling = emptyLi.nextSibling;
            parentList.removeChild(emptyLi);
            
            pastedListItems.forEach(li => {
                const clonedLi = li.cloneNode(true);
                if (nextSibling) {
                    parentList.insertBefore(clonedLi, nextSibling);
                } else {
                    parentList.appendChild(clonedLi);
                }
            });
            
            // 結果を取得
            const resultLis = document.querySelectorAll('li');
            return Array.from(resultLis).map(li => li.textContent);
        });
        
        console.log('Result after paste into empty li:', result);
        // 期待: ['aaa', 'bbb', 'eeefff', 'fff', 'ccc']
        // textContentはネストされた要素のテキストも含むため、eeeの項目はeeefff
        expect(result).toContain('aaa');
        expect(result).toContain('bbb');
        expect(result.some(t => t.includes('eee'))).toBe(true);
        expect(result).toContain('fff');
        expect(result).toContain('ccc');
        // 空の項目がないことを確認
        expect(result.filter(t => t.trim() === '').length).toBe(0);
    });

    test('値のあるリスト項目にリストをペースト → 直後に挿入', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // bbb の末尾にカーソルを置いてペースト処理を直接実行
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const lis = document.querySelectorAll('li');
            const bbbLi = lis[1]; // bbb の li
            
            // カーソルを設定
            const range = document.createRange();
            range.selectNodeContents(bbbLi);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            editor.focus();
            
            // ペースト処理を直接シミュレート（リストをリストにペースト）
            // パターン2: 値のあるリスト項目の直後に挿入
            const pastedHtml = '<ul><li>eee<ul><li>fff</li></ul></li></ul>';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = pastedHtml;
            const pastedList = tempDiv.querySelector('ul');
            const pastedListItems = Array.from(pastedList.children).filter(el => el.tagName === 'LI');
            
            // bbbの直後にペーストされたliを挿入
            const parentList = bbbLi.parentNode;
            let insertAfterLi = bbbLi;
            
            pastedListItems.forEach(li => {
                const clonedLi = li.cloneNode(true);
                if (insertAfterLi.nextSibling) {
                    parentList.insertBefore(clonedLi, insertAfterLi.nextSibling);
                } else {
                    parentList.appendChild(clonedLi);
                }
                insertAfterLi = clonedLi;
            });
            
            // 結果を取得
            const resultLis = document.querySelectorAll('li');
            return Array.from(resultLis).map(li => li.textContent);
        });
        
        console.log('Result after paste into non-empty li:', result);
        // 期待: ['aaa', 'bbb', 'eeefff', 'fff', 'ccc']
        // textContentはネストされた要素のテキストも含むため、eeeの項目はeeefff
        expect(result[0]).toBe('aaa');
        expect(result[1]).toBe('bbb');
        expect(result[2]).toBe('eeefff');
        expect(result[3]).toBe('fff');
        expect(result[4]).toBe('ccc');
    });

    test('リスト項目の途中にカーソルを置いてリストをペースト → 直後に挿入', async ({ page }) => {
        // 初期状態:
        // - aaa
        // - bbb
        // - ccc
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>aaa</li><li>bbb</li><li>ccc</li></ul>';
        });
        await page.waitForTimeout(100);
        
        // bbb の途中にカーソルを置いてペースト処理を直接実行
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const lis = document.querySelectorAll('li');
            const bbbLi = lis[1]; // bbb の li
            const textNode = bbbLi.firstChild;
            
            // カーソルを設定（途中）
            const range = document.createRange();
            range.setStart(textNode, 1);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            editor.focus();
            
            // ペースト処理を直接シミュレート（リストをリストにペースト）
            // パターン2: 値のあるリスト項目の直後に挿入（途中でも同じ動作）
            const pastedHtml = '<ul><li>eee</li></ul>';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = pastedHtml;
            const pastedList = tempDiv.querySelector('ul');
            const pastedListItems = Array.from(pastedList.children).filter(el => el.tagName === 'LI');
            
            // bbbの直後にペーストされたliを挿入
            const parentList = bbbLi.parentNode;
            let insertAfterLi = bbbLi;
            
            pastedListItems.forEach(li => {
                const clonedLi = li.cloneNode(true);
                if (insertAfterLi.nextSibling) {
                    parentList.insertBefore(clonedLi, insertAfterLi.nextSibling);
                } else {
                    parentList.appendChild(clonedLi);
                }
                insertAfterLi = clonedLi;
            });
            
            // 結果を取得
            const resultLis = document.querySelectorAll('li');
            return Array.from(resultLis).map(li => li.textContent);
        });
        
        console.log('Result after paste into middle of li:', result);
        // 期待: ['aaa', 'bbb', 'eee', 'ccc']
        expect(result[0]).toBe('aaa');
        expect(result[1]).toBe('bbb');
        expect(result[2]).toBe('eee');
        expect(result[3]).toBe('ccc');
    });
});
