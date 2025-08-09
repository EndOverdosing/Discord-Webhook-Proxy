require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.development.local') });

const express = require('express');
const axios = require('axios');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;

console.log("Application starting...");

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let db;
let rateLimitStore;

if (process.env.VERCEL_ENV === 'production') {
    console.log('Running in PRODUCTION. Using real Vercel KV and Redis.');
    const { kv } = require('@vercel/kv');
    const { RedisStore } = require('rate-limit-redis');
    const Redis = require('ioredis');
    db = kv;
    const redisClient = new Redis(process.env.KV_URL);
    rateLimitStore = new RedisStore({ sendCommand: (...args) => redisClient.call(...args) });

} else {
    console.log('Running in DEVELOPMENT. Using a file-based database (local-db.json).');
    const dbPath = path.join(process.cwd(), 'local-db.json');

    const readDb = async () => {
        try {
            const data = await fs.readFile(dbPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    };

    db = {
        set: async (key, value) => {
            const data = await readDb();
            data[key] = value;
            await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
        },
        get: async (key) => {
            const data = await readDb();
            return data[key];
        }
    };
}

const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
const proxyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const generateId = (length = 8) => {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

app.post('/api/create', createLimiter, async (req, res) => {
    const { webhookUrl } = req.body;
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return res.status(400).json({ error: 'Invalid Discord webhook URL provided.' });
    }
    try {
        const id = generateId();
        await db.set(`webhook:${id}`, webhookUrl);
        console.log(`[DB-WRITE-OK] Wrote key: webhook:${id}`);
        const proxyUrl = `${req.protocol}://${req.get('host')}/api/proxy/${id}`;
        res.status(200).json({ proxyUrl });
    } catch (error) {
        console.error('[DB-WRITE-FAIL]', error);
        res.status(500).json({ error: 'Could not create proxy link.' });
    }
});

app.post('/api/proxy/:id', proxyLimiter, async (req, res) => {
    const { id } = req.params;
    if (!id) { return res.status(400).json({ error: 'Proxy ID is missing.' }); }
    try {
        const webhookUrl = await db.get(`webhook:${id}`);
        if (!webhookUrl) {
            console.log(`[DB-READ-FAIL] Key not found: webhook:${id}`);
            return res.status(404).json({ error: 'Proxy link not found or expired.' });
        }
        console.log(`[DB-READ-OK] Retrieved key: webhook:${id}`);
        await axios.post(webhookUrl, req.body, { headers: { 'Content-Type': 'application/json' } });
        res.status(204).send();
    } catch (error) {
        console.error('[PROXY-FAIL]', error);
        res.status(500).json({ error: 'Failed to forward request to Discord.' });
    }
});

app.get('/*', (req, res) => { res.sendFile(path.join(__dirname, '../public/index.html')); });

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => { console.log(`Server running at http://localhost:${PORT}`); });
}

module.exports = app;