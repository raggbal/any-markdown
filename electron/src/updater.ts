import { BrowserWindow, dialog, shell, net, app } from 'electron';

/**
 * Lightweight update checker — no external dependencies.
 * Fetches all releases and finds the latest "electron-v*" tagged one.
 * This avoids collision with VSCode extension releases on /releases/latest.
 */

const GITHUB_OWNER = 'raggbal';
const GITHUB_REPO = 'fractal';
const TAG_PREFIX = 'electron-v';
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

interface GitHubRelease {
    tag_name: string;   // "electron-v0.195.387"
    html_url: string;   // Release page URL
    body?: string;      // Release notes
    draft: boolean;
    prerelease: boolean;
}

function getCurrentVersion(): string {
    return app.getVersion(); // reads from package.json "version"
}

function compareVersions(current: string, latest: string): boolean {
    const strip = (v: string) => v.replace(/^(electron-)?v?/, '');
    const cur = strip(current).split('.').map(Number);
    const lat = strip(latest).split('.').map(Number);

    for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
        const c = cur[i] || 0;
        const l = lat[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }
    return false;
}

function fetchLatestElectronRelease(): Promise<GitHubRelease | null> {
    return new Promise((resolve) => {
        // Fetch first page (30 releases) — enough to find the latest electron release
        const request = net.request(`${API_URL}?per_page=30`);
        request.setHeader('User-Agent', `AnyMarkdown/${getCurrentVersion()}`);

        let data = '';
        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                resolve(null);
                return;
            }
            response.on('data', (chunk) => { data += chunk.toString(); });
            response.on('end', () => {
                try {
                    const releases: GitHubRelease[] = JSON.parse(data);
                    // Find the first non-draft, non-prerelease with "electron-v" tag
                    const match = releases.find(r =>
                        r.tag_name.startsWith(TAG_PREFIX) &&
                        !r.draft &&
                        !r.prerelease
                    );
                    resolve(match || null);
                } catch {
                    resolve(null);
                }
            });
        });
        request.on('error', () => resolve(null));
        request.end();
    });
}

export function setupUpdateChecker(mainWindow: BrowserWindow): void {
    // First check 15s after launch (don't slow down startup)
    setTimeout(() => checkForUpdates(mainWindow, false), 15_000);

    // Then check every 24 hours
    setInterval(() => checkForUpdates(mainWindow, false), 24 * 60 * 60 * 1000);
}

export async function checkForUpdates(
    mainWindow: BrowserWindow,
    manual: boolean
): Promise<void> {
    const release = await fetchLatestElectronRelease();
    const currentVersion = getCurrentVersion();

    if (!release) {
        if (manual) {
            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Update Check',
                message: 'Failed to check for updates',
                detail: 'Please check your network connection.',
            });
        }
        return;
    }

    const hasUpdate = compareVersions(currentVersion, release.tag_name);

    if (hasUpdate) {
        const latestVersion = release.tag_name.replace(/^electron-v/, '');
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `A new version ${latestVersion} is available`,
            detail: `Current version: ${currentVersion}\n\n${release.body || ''}`.trim(),
            buttons: ['Open Download Page', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });

        if (result.response === 0) {
            shell.openExternal(release.html_url);
        }
    } else if (manual) {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Check',
            message: 'You are on the latest version',
            detail: `Version ${currentVersion}`,
        });
    }
    // Silent auto-check with no update → show nothing
}
