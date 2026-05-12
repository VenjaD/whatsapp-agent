require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const cron = require('node-cron');
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
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *';
const FEED_URL = process.env.FEED_URL;
const HEADLINE_COUNT = parseInt(process.env.HEADLINE_COUNT || '5', 10);

if (!GROUP_NAME) {
    console.error('Missing GROUP_NAME in .env');
    process.exit(1);
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
    console.log(`Ready. Cron: "${CRON_SCHEDULE}" → group: "${GROUP_NAME}"`);

    cron.schedule(CRON_SCHEDULE, async () => {
        try {
            await postNews();
        } catch (err) {
            console.error('Failed to post news:', err.message);
        }
    });
});

client.on('auth_failure', msg => {
    console.error('Authentication failed:', msg);
    process.exit(1);
});

async function postNews() {
    const articles = await fetchHeadlines(FEED_URL, HEADLINE_COUNT);
    if (!articles.length) {
        console.warn('No articles fetched — skipping.');
        return;
    }

    const message = formatMessage(articles);
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === GROUP_NAME);

    if (!group) {
        console.error(`Group "${GROUP_NAME}" not found. Available groups:`);
        chats.filter(c => c.isGroup).forEach(g => console.error(' -', g.name));
        return;
    }

    await group.sendMessage(message);
    console.log(`Sent ${articles.length} headlines to "${group.name}"`);
}

function formatMessage(articles) {
    const date = new Date().toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const lines = articles.map((a, i) => {
        const summary = a.summary ? `\n_${a.summary}_` : '';
        return `*${i + 1}. ${a.title}*${summary}\n${a.link}`;
    });
    return `*BBC News — ${date}*\n\n${lines.join('\n\n')}`;
}

client.initialize();
