import * as vscode from 'vscode';
import { AnyMarkdownEditorProvider } from './editorProvider';
import { initLocale, t } from './i18n/messages';

export function activate(context: vscode.ExtensionContext) {
    // Initialize localization
    initLocale();
    
    console.log('Any Markdown Editor is now active!');

    // Register the custom editor provider
    const provider = new AnyMarkdownEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'any-markdown.editor',
            provider,
            {
                webviewOptions: {
                    // Note: retainContextWhenHidden can cause issues after extension updates
                    // because VSCode may try to restore old webview state with new extension code.
                    // We handle this by always clearing webview.html first in resolveCustomTextEditor.
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('any-markdown.openEditor', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'markdown') {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    activeEditor.document.uri,
                    'any-markdown.editor'
                );
            } else {
                vscode.window.showInformationMessage(t('openMarkdownFirst'));
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('any-markdown.insertTable', async () => {
            const rows = await vscode.window.showInputBox({
                prompt: t('numberOfRows'),
                value: '3',
                validateInput: (value) => {
                    const num = parseInt(value);
                    return isNaN(num) || num < 1 ? t('enterValidNumber') : null;
                }
            });
            if (!rows) return;

            const cols = await vscode.window.showInputBox({
                prompt: t('numberOfColumns'),
                value: '3',
                validateInput: (value) => {
                    const num = parseInt(value);
                    return isNaN(num) || num < 1 ? t('enterValidNumber') : null;
                }
            });
            if (!cols) return;

            const table = generateMarkdownTable(parseInt(rows), parseInt(cols));
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, table);
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('any-markdown.insertToc', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, '[TOC]\n');
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('any-markdown.exportToPdf', () => {
            vscode.window.showInformationMessage(t('pdfExportComingSoon'));
        })
    );

    // Open markdown file in standard text editor
    context.subscriptions.push(
        vscode.commands.registerCommand('any-markdown.openAsText', async (uri?: vscode.Uri) => {
            // Get URI from argument (context menu) or active editor
            let targetUri = uri;
            if (!targetUri) {
                const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                if (activeTab && activeTab.input && (activeTab.input as any).uri) {
                    targetUri = (activeTab.input as any).uri;
                }
            }
            
            if (targetUri) {
                // Open with default text editor
                await vscode.commands.executeCommand('vscode.openWith', targetUri, 'default');
            } else {
                vscode.window.showWarningMessage(t('openMarkdownFirst'));
            }
        })
    );

    // Compare markdown files as text
    context.subscriptions.push(
        vscode.commands.registerCommand('any-markdown.compareAsText', async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            
            let file1Uri: vscode.Uri | undefined;
            let file2Uri: vscode.Uri | undefined;
            
            // Check if multiple files are selected (2 files)
            if (uris && uris.length === 2) {
                // Two files selected - skip file dialog
                file1Uri = uris[0];
                file2Uri = uris[1];
            } else {
                // Single file or no selection - use original behavior
                file1Uri = uri;
                if (!file1Uri) {
                    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
                    if (activeTab && activeTab.input && (activeTab.input as any).uri) {
                        file1Uri = (activeTab.input as any).uri;
                    }
                }
                
                if (!file1Uri) {
                    vscode.window.showWarningMessage(t('openMarkdownFirst'));
                    return;
                }

                // Let user select file to compare with
                const compareFileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'Markdown': ['md', 'markdown']
                    },
                    title: t('selectFileToCompare')
                });

                if (compareFileUri && compareFileUri[0]) {
                    file2Uri = compareFileUri[0];
                }
            }
            
            if (!file1Uri || !file2Uri) {
                return;
            }
            
            // Read both files
            const content1 = fs.readFileSync(file1Uri.fsPath, 'utf8');
            const content2 = fs.readFileSync(file2Uri.fsPath, 'utf8');
            
            const fileName1 = path.basename(file1Uri.fsPath);
            const fileName2 = path.basename(file2Uri.fsPath);
            
            // Create temp files with .txt extension (won't trigger custom editor)
            // Use timestamp to avoid conflicts
            const timestamp = Date.now();
            const tempDir = os.tmpdir();
            const tempFile1 = path.join(tempDir, `anymd-compare-${timestamp}-1-${fileName1}.txt`);
            const tempFile2 = path.join(tempDir, `anymd-compare-${timestamp}-2-${fileName2}.txt`);
            
            fs.writeFileSync(tempFile1, content1, 'utf8');
            fs.writeFileSync(tempFile2, content2, 'utf8');
            
            const tempUri1 = vscode.Uri.file(tempFile1);
            const tempUri2 = vscode.Uri.file(tempFile2);
            
            // Open diff view
            const title = `${fileName1} ↔ ${fileName2}`;
            await vscode.commands.executeCommand('vscode.diff', tempUri1, tempUri2, title);
            
            // Note: Temp files are left in temp directory and will be cleaned up by OS
            // Attempting to track and delete them caused issues with the diff view
        })
    );
}

function generateMarkdownTable(rows: number, cols: number): string {
    let table = '|';
    for (let c = 0; c < cols; c++) {
        table += ` Header ${c + 1} |`;
    }
    table += '\n|';
    for (let c = 0; c < cols; c++) {
        table += ' --- |';
    }
    for (let r = 0; r < rows - 1; r++) {
        table += '\n|';
        for (let c = 0; c < cols; c++) {
            table += ` Cell |`;
        }
    }
    table += '\n';
    return table;
}

export function deactivate() {}
