/**
 * notes-s3-sync.ts — AWS CLI を使った S3 同期エンジン
 *
 * VSCode固有（src/ 配置）。child_process.spawn で aws cli を実行し、
 * 進捗をコールバックで返す。認証情報は環境変数で渡す。
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface S3SyncProgress {
    phase: 'checking' | 'syncing' | 'uploading' | 'downloading' | 'deleting' | 'complete' | 'error';
    message: string;
    currentFile?: string;
    filesProcessed?: number;
}

export interface S3SyncConfig {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketPath: string;   // "my-bucket/notes-backup"
    localPath: string;    // ノートフォルダの絶対パス
}

function getAwsEnv(config: S3SyncConfig): NodeJS.ProcessEnv {
    return {
        ...process.env,
        AWS_ACCESS_KEY_ID: config.accessKeyId,
        AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
        AWS_DEFAULT_REGION: config.region,
    };
}

function s3Uri(config: S3SyncConfig): string {
    // 末尾スラッシュを確保（フォルダ全体のsyncを確実にする）
    const bp = config.bucketPath.replace(/\/+$/, '');
    return `s3://${bp}/`;
}

function localDir(config: S3SyncConfig): string {
    // 末尾スラッシュを確保
    return config.localPath.replace(/\/+$/, '') + '/';
}

/**
 * AWS CLI が利用可能か確認
 */
export async function checkAwsCli(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn('aws', ['--version'], { stdio: 'pipe' });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
    });
}

/**
 * spawn した aws プロセスの stdout/stderr を行単位でパースし、進捗を報告する
 */
function runAwsCommand(
    args: string[],
    config: S3SyncConfig,
    phase: S3SyncProgress['phase'],
    onProgress: (p: S3SyncProgress) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn('aws', args, {
            env: getAwsEnv(config),
            stdio: 'pipe',
        });

        let stderr = '';
        let filesProcessed = 0;

        proc.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                filesProcessed++;
                // aws s3 sync/cp/rm の出力: "upload: ./file.out to s3://..." or "delete: s3://..."
                const match = line.match(/^(upload|download|delete|copy):\s+(.+)/i);
                const currentFile = match ? match[2].split(' to ')[0].split(' from ')[0].trim() : line.trim();
                onProgress({
                    phase,
                    message: `${phase}... (${filesProcessed} files)`,
                    currentFile,
                    filesProcessed,
                });
            }
        });

        proc.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to run aws command: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`aws command failed (exit ${code}): ${stderr.trim()}`));
            }
        });
    });
}

/**
 * Sync (Backup): ローカル → S3 に同期（差分のみ転送、リモートに余分なファイルがあれば削除）
 */
export async function s3Sync(
    config: S3SyncConfig,
    onProgress: (p: S3SyncProgress) => void,
): Promise<void> {
    onProgress({ phase: 'checking', message: 'Checking AWS CLI...' });

    if (!(await checkAwsCli())) {
        throw new Error('AWS CLI is not installed. Please install it from https://aws.amazon.com/cli/');
    }

    onProgress({ phase: 'syncing', message: 'Syncing to S3...' });

    await runAwsCommand(
        ['s3', 'sync', localDir(config), s3Uri(config), '--delete'],
        config,
        'syncing',
        onProgress,
    );

    onProgress({ phase: 'complete', message: 'Sync complete.' });
}

/**
 * Remote Delete & Upload: S3のデータを全削除してからローカルをアップロード
 */
export async function s3RemoteDeleteAndUpload(
    config: S3SyncConfig,
    onProgress: (p: S3SyncProgress) => void,
): Promise<void> {
    onProgress({ phase: 'checking', message: 'Checking AWS CLI...' });

    if (!(await checkAwsCli())) {
        throw new Error('AWS CLI is not installed. Please install it from https://aws.amazon.com/cli/');
    }

    // Phase 1: リモート全削除
    onProgress({ phase: 'deleting', message: 'Deleting remote files...' });
    await runAwsCommand(
        ['s3', 'rm', s3Uri(config), '--recursive'],
        config,
        'deleting',
        onProgress,
    );

    // Phase 2: ローカルをアップロード
    onProgress({ phase: 'uploading', message: 'Uploading local files...' });
    await runAwsCommand(
        ['s3', 'cp', localDir(config), s3Uri(config), '--recursive'],
        config,
        'uploading',
        onProgress,
    );

    onProgress({ phase: 'complete', message: 'Remote delete & upload complete.' });
}

/**
 * Local Delete & Download: ローカルを全削除してからS3をダウンロード
 */
export async function s3LocalDeleteAndDownload(
    config: S3SyncConfig,
    onProgress: (p: S3SyncProgress) => void,
): Promise<void> {
    onProgress({ phase: 'checking', message: 'Checking AWS CLI...' });

    if (!(await checkAwsCli())) {
        throw new Error('AWS CLI is not installed. Please install it from https://aws.amazon.com/cli/');
    }

    // Phase 1: ローカルファイルを全削除（フォルダ自体は残す）
    onProgress({ phase: 'deleting', message: 'Deleting local files...' });
    deleteLocalFiles(config.localPath);

    // Phase 2: S3からダウンロード
    onProgress({ phase: 'downloading', message: 'Downloading from S3...' });
    await runAwsCommand(
        ['s3', 'cp', s3Uri(config), localDir(config), '--recursive'],
        config,
        'downloading',
        onProgress,
    );

    onProgress({ phase: 'complete', message: 'Local delete & download complete.' });
}

/**
 * ローカルフォルダ内の全ファイル・サブフォルダを削除（ルートフォルダ自体は残す）
 */
function deleteLocalFiles(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
    }
}
