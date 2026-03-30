import * as vscode from 'vscode';
import * as path from 'path';

/**
 * NotesFolderProvider — Activity Bar の Notes フォルダ一覧を提供する TreeDataProvider
 * globalState でフォルダ一覧を永続化
 */
export class NotesFolderProvider implements vscode.TreeDataProvider<NotesFolderItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<NotesFolderItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private folders: string[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.folders = context.globalState.get<string[]>('notesFolders', []);
    }

    getTreeItem(element: NotesFolderItem): vscode.TreeItem {
        return element;
    }

    getChildren(): NotesFolderItem[] {
        return this.folders.map(f => new NotesFolderItem(f));
    }

    async addFolder(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Notes Folder',
        });
        if (!result || result.length === 0) return;
        const folderPath = result[0].fsPath;
        if (this.folders.includes(folderPath)) {
            vscode.window.showInformationMessage('This folder is already registered.');
            return;
        }
        this.folders.push(folderPath);
        await this.context.globalState.update('notesFolders', this.folders);
        this._onDidChangeTreeData.fire(undefined);
    }

    async removeFolder(item: NotesFolderItem): Promise<void> {
        const idx = this.folders.indexOf(item.folderPath);
        if (idx >= 0) {
            this.folders.splice(idx, 1);
            await this.context.globalState.update('notesFolders', this.folders);
            this._onDidChangeTreeData.fire(undefined);
        }
    }
}

export class NotesFolderItem extends vscode.TreeItem {
    public readonly folderPath: string;

    constructor(folderPath: string) {
        super(path.basename(folderPath), vscode.TreeItemCollapsibleState.None);
        this.folderPath = folderPath;
        this.tooltip = folderPath;
        this.contextValue = 'notesFolder';
        this.command = {
            command: 'fractal.openNotesFolder',
            title: 'Open Notes',
            arguments: [folderPath],
        };
        this.iconPath = new vscode.ThemeIcon('notebook');
    }
}
