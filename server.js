import express from 'express';
import cors from 'cors';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Set up multer for handling file uploads (in memory buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const API_BASE = 'https://api.presaige.ai/v1';

// 1. Upload Proxy
app.post('/api/proxy/upload', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ error: 'Missing x-api-key header' });
        }

        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Presaige Upload Status ${response.status}:`, errText);
            return res.status(response.status).json({ error: errText });
        }

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Submit Job Proxy (Score / Recommendations)
app.post('/api/proxy/:jobType', async (req, res) => {
    try {
        const jobType = req.params.jobType;
        if (!['score', 'recommendations'].includes(jobType)) {
            return res.status(404).json({ error: 'Invalid job type' });
        }

        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ error: 'Missing x-api-key header' });
        }

        const response = await fetch(`${API_BASE}/${jobType}`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error(`${req.params.jobType} Error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Polling Proxy
app.use('/api/proxy/poll', async (req, res) => {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ error: 'Missing x-api-key header' });
        }

        // req.url will be something like `/score/xxx`
        const pollPath = req.url.startsWith('/') ? req.url.substring(1) : req.url;

        if (!pollPath) {
            return res.status(400).json({ error: 'Missing poll path' });
        }

        let targetUrl = pollPath;
        if (!pollPath.startsWith('http')) {
            targetUrl = `${API_BASE}/${pollPath}`;
        }

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey
            }
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Polling Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend proxy server listening at http://localhost:${port}`);
});
