const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const CACHE_FILE = './cache.json';
let cache = {};

if (fs.existsSync(CACHE_FILE)) {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE));
}

function saveCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function canEmbed(url) {
    // 24h cache
    if (cache[url] && Date.now() - cache[url].time < 86400000) {
        return cache[url].result;
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    let result = false;

    try {
        await page.setContent(`
            <iframe id="f" src="${url}" style="width:800px;height:600px;"></iframe>
        `);

        await page.waitForTimeout(4000);

        result = await page.evaluate(() => {
            const iframe = document.getElementById('f');

            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;

                return doc && doc.body && doc.body.innerText.length > 50;
            } catch {
                return false;
            }
        });

    } catch {
        result = false;
    }

    await browser.close();

    cache[url] = { result, time: Date.now() };
    saveCache();

    return result;
}

app.get('/check', async (req, res) => {
    const url = req.query.url;

    if (!url) return res.json({ canEmbed: false });

    const result = await canEmbed(url);

    res.json({ canEmbed: result });
});

app.listen(PORT, () => {
    console.log(`Running on ${PORT}`);
});