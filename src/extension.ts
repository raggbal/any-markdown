import * as vscode from 'vscode';
import * as path from 'path';
import { AnyMarkdownEditorProvider } from './editorProvider';
import { OutlinerProvider } from './outlinerProvider';
import { NotesFolderProvider } from './notesFolderProvider';
import { NotesEditorProvider } from './notesEditorProvider';
import { initLocale, t } from './i18n/messages';

interface FractalLinkParams {
    noteFolderName: string;
    outFileId: string;
    nodeId?: string;
    pageId?: string;
}

function parseFractalLink(url: string): FractalLinkParams | null {
    // Page link: fractal://note/{folder}/{outFileId}/page/{pageId}
    const pageMatch = url.match(/^fractal:\/\/note\/([^/]+)\/([^/]+)\/page\/([^/?]+)$/);
    if (pageMatch) {
        return {
            noteFolderName: decodeURIComponent(pageMatch[1]),
            outFileId: decodeURIComponent(pageMatch[2]),
            pageId: decodeURIComponent(pageMatch[3]),
        };
    }
    // Node link: fractal://note/{folder}/{outFileId}/{nodeId}
    const nodeMatch = url.match(/^fractal:\/\/note\/([^/]+)\/([^/]+)\/([^/?]+)$/);
    if (nodeMatch) {
        return {
            noteFolderName: decodeURIComponent(nodeMatch[1]),
            outFileId: decodeURIComponent(nodeMatch[2]),
            nodeId: decodeURIComponent(nodeMatch[3]),
        };
    }
    return null;
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize localization
    const config = vscode.workspace.getConfiguration('fractal');
    initLocale(config.get<string>('language', 'default'), vscode.env.language);
    
    console.log('Fractal is now active!');

    // Register the custom editor provider
    const provider = new AnyMarkdownEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'fractal.editor',
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

    // Register the outliner provider for .out files
    const outlinerProvider = new OutlinerProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'fractal.outliner',
            outlinerProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.openEditor', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'markdown') {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    activeEditor.document.uri,
                    'fractal.editor'
                );
            } else {
                vscode.window.showInformationMessage(t('openMarkdownFirst'));
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.insertTable', async () => {
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
        vscode.commands.registerCommand('fractal.insertToc', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, '[TOC]\n');
                });
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.exportToPdf', () => {
            vscode.window.showInformationMessage(t('pdfExportComingSoon'));
        })
    );

    // Undo/Redo commands - forwarded to webview to bypass VSCode's native undo
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.undo', () => {
            provider.sendUndo();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.redo', () => {
            if (!provider.sendRedo()) {
                // Fallback to built-in redo when our custom editor is not active
                vscode.commands.executeCommand('redo');
            }
        })
    );

    // Toggle source mode - forwarded to webview
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.toggleSourceMode', () => {
            provider.sendToggleSourceMode();
        })
    );

    // --- Notes (Activity Bar + WebviewPanel) ---
    const notesFolderProvider = new NotesFolderProvider(context);
    const notesEditorProvider = new NotesEditorProvider(context);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('notesExplorer', notesFolderProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.addNotesFolder', () => {
            notesFolderProvider.addFolder();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.removeNotesFolder', (item) => {
            notesFolderProvider.removeFolder(item);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.openNotesFolder', (folderPath: string) => {
            notesEditorProvider.openNotesFolder(folderPath);
        })
    );

    // In-app link navigation command
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.navigateInAppLink', async (linkUrl: string) => {
            const parsed = parseFractalLink(linkUrl);
            if (!parsed) {
                vscode.window.showErrorMessage('Invalid in-app link format');
                return;
            }
            const folders = notesFolderProvider.getFolders();
            const folderPath = folders.find(f => path.basename(f) === parsed.noteFolderName);
            if (!folderPath) {
                vscode.window.showErrorMessage(`Notes folder "${parsed.noteFolderName}" not found. Register it in the Notes panel first.`);
                return;
            }
            if (parsed.pageId) {
                // Page link: open md in CURRENT note's sidepanel (no note/outliner switch)
                // Resolve file path from target note's folder, then open in current panel
                const pagePath = notesEditorProvider.resolvePagePath(folderPath, parsed.outFileId, parsed.pageId!);
                if (pagePath) {
                    notesEditorProvider.openPageInCurrentPanel(pagePath);
                } else {
                    vscode.window.showWarningMessage('Page file not found');
                }
            } else {
                // Node link: navigate to note + outliner + node
                await notesEditorProvider.openNotesFolder(folderPath);
                setTimeout(() => {
                    notesEditorProvider.navigateToLink(folderPath, parsed);
                }, 500);
            }
        })
    );

    // Outliner scope commands - forwarded to webview
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.scopeIn', () => {
            outlinerProvider.sendScopeIn();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.scopeOut', () => {
            outlinerProvider.sendScopeOut();
        })
    );

    // New outliner file
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.newOutliner', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter outliner file name (without .out extension)',
                placeHolder: 'my-notes',
                validateInput: (value) => {
                    if (!value || !value.trim()) { return 'File name is required'; }
                    if (/[/\\:*?"<>|]/.test(value)) { return 'Invalid characters in file name'; }
                    return null;
                }
            });
            if (!name) { return; }

            const folders = vscode.workspace.workspaceFolders;
            let targetDir: vscode.Uri;
            if (folders && folders.length > 0) {
                targetDir = folders[0].uri;
            } else {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select folder for outliner file'
                });
                if (!selected || !selected[0]) { return; }
                targetDir = selected[0];
            }

            const fileName = name.trim().endsWith('.out') ? name.trim() : `${name.trim()}.out`;
            const fileUri = vscode.Uri.joinPath(targetDir, fileName);

            try {
                await vscode.workspace.fs.stat(fileUri);
                vscode.window.showWarningMessage(`File "${fileName}" already exists.`);
                return;
            } catch {
                // File doesn't exist — good
            }

            const emptyData = JSON.stringify({ rootIds: [], nodes: {} }, null, 2);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(emptyData, 'utf8'));
            await vscode.commands.executeCommand('vscode.openWith', fileUri, 'fractal.outliner');
        })
    );

    // Open markdown file in standard text editor
    context.subscriptions.push(
        vscode.commands.registerCommand('fractal.openAsText', async (uri?: vscode.Uri) => {
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
        vscode.commands.registerCommand('fractal.compareAsText', async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
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
