import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './test/specs',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,
    reporter: 'list',
    timeout: 30000,
    
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        headless: true,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: {
        command: 'npx serve test/html -l 3000',
        port: 3000,
        timeout: 30000,
        reuseExistingServer: true,
    },
});