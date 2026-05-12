require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const { fetchHeadlines } = require('./scraper');

const app = express();
let currentQR = null;
let isAuthenticated = false;

app.get('/', async (req, res) => {
    if (isAuthenticated) {
        return res.send('<h2 style="font-family:sans-serif;color:green">✅ WhatsApp authenticated! Bot is running.</h2>');
    }
    if (!currentQR) {
        return res.send('<h2 style="font-family:sans-serif">⏳ Waiting for QR code... Refresh in a few seconds.</h2><script>setTimeout(()=>location.reload(),3000)</script>');
    }
    const dataUrl = await QRCode.toDataURL(currentQR);
    res.send(`<!DOCTYPE html>
<html><head><title>WhatsApp QR</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h2>Scan with WhatsApp → Linked Devices → Link a Device</h2>
  <img src="${dataUrl}" style="width:300px;height:300px"/>
  <p style="color:gray">QR refreshes automatically</p>
  <script>setTimeout(()=>location.reload(),20000)</script>
</body></html>`);
});

app.listen(3000, () => console.log('QR web server running at http://localhost:3000'));

const GROUP_NAME = process.env.GROUP_NAME;
const FEED_URL = process.env.FEED_URL;
const HEADLINE_COUNT = parseInt(process.env.HEADLINE_COUNT || '30', 10);
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // refresh feed every 15 minutes

if (!GROUP_NAME) {
    console.error('Missing GROUP_NAME in .env');
    process.exit(1);
}

// Article queue — pre-fetched in background, consumed one per trigger
let articleQueue = [];
let articleIndex = 0;

async function refreshFeed() {
    try {
        const articles = await fetchHeadlines(FEED_URL, HEADLINE_COUNT);
        if (articles.length) {
            articleQueue = articles;
            articleIndex = 0;
            console.log(`Feed refreshed — ${articles.length} articles ready.`);
        }
    } catch (err) {
        console.error('Failed to refresh feed:', err.message);
    }
}

function nextArticle() {
    if (!articleQueue.length) return null;
    const article = articleQueue[articleIndex % articleQueue.length];
    articleIndex++;
    return article;
}

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

client.on('qr', qr => {
    currentQR = qr;
    console.log('QR code ready — open http://localhost:3000 to scan');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    isAuthenticated = true;
    currentQR = null;
    console.log('Authenticated — session saved.');
});

client.on('ready', async () => {
    console.log(`Ready. Listening for messages in "${GROUP_NAME}"`);
    await refreshFeed();
    setInterval(refreshFeed, REFRESH_INTERVAL_MS);
});

client.on('auth_failure', msg => {
    console.error('Authentication failed:', msg);
    process.exit(1);
});

client.on('message', async msg => {
    const chat = await msg.getChat();
    if (!chat.isGroup || chat.name !== GROUP_NAME) return;
    if (msg.fromMe) return;

    const sender = msg.author || msg.from;
    if (sender !== '103204423503993@lid') return;

    const article = nextArticle();
    if (!article) {
        console.warn('No articles in queue yet.');
        return;
    }

    const caption = formatArticle(article);
    console.log(`Triggered by message — sending: "${article.title}"`);

    if (article.imageUrl) {
        try {
            const response = await axios.get(article.imageUrl, { responseType: 'arraybuffer' });
            const mimeType = response.headers['content-type'] || 'image/jpeg';
            const data = Buffer.from(response.data).toString('base64');
            const media = new MessageMedia(mimeType, data);
            await chat.sendMessage(media, { caption });
        } catch {
            await chat.sendMessage(caption);
        }
    } else {
        await chat.sendMessage(caption);
    }
});

function formatArticle(article) {
    const summary = article.summary ? `\n_${article.summary}_` : '';
    return `*${article.title}*${summary}\n${article.link}`;
}

client.initialize();
