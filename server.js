const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const CACHE_FILE = './cache.json';
let cache = {};

// Load cache
if (fs.existsSync(CACHE_FILE)) {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE));
}

// Save cache
function saveCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Prevent huge cache
function limitCache() {
    if (Object.keys(cache).length > 1000) {
        cache = {};
    }
}

// 🔥 Reuse browser (IMPORTANT)
let browser;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return browser;
}

// 🔥 Core detection logic
async function detectIframe(url) {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    try {
        await page.setContent(`
            <html>
            <body>
                <iframe id="f" src="${url}" style="width:800px;height:600px;"></iframe>
            </body>
            </html>
        `);

        await page.waitForTimeout(4000);

        const frame = page.frames().find(f => {
            const fUrl = f.url();
            return fUrl && fUrl !== 'about:blank' && !fUrl.startsWith('chrome-error');
        });

        let result = true;

        if (!frame) {
            result = false;
        } else {
            const frameUrl = frame.url();

            if (
                frameUrl === 'about:blank' ||
                frameUrl.startsWith('chrome-error://') ||
                frameUrl.includes('denied')
            ) {
                result = false;
            } else {
                result = true;
            }
        }

        await page.close();
        return result;

    } catch (e) {
        await page.close();
        return false;
    }
}

// 🔥 Main function with cache + timeout
async function canEmbed(url) {
    // 24h cache
    if (cache[url] && Date.now() - cache[url].time < 86400000) {
        return cache[url].result;
    }

    const result = await Promise.race([
        detectIframe(url),
        new Promise(resolve => setTimeout(() => resolve(false), 7000))
    ]);

    cache[url] = {
        result,
        time: Date.now()
    };

    limitCache();
    saveCache();

    return result;
}

// API route
app.get('/check', async (req, res) => {
    const url = req.query.url;

    if (!url) return res.json({ canEmbed: false });

    try {
        const result = await canEmbed(url);
        res.json({ canEmbed: result });
    } catch {
        res.json({ canEmbed: false });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Railway running on port ${PORT}`);
});