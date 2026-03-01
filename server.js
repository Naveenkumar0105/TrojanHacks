import express from 'express';
import cors from 'cors';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

// Initialize Gemini
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

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

// 4. Reel Generator Orchestrator
app.post('/api/generate-reel', async (req, res) => {
    try {
        const { idea, location, audience, presaigeKey } = req.body;

        if (!idea || !location || !audience) {
            return res.status(400).json({ error: 'Missing idea, location, or audience' });
        }

        if (!ai) {
            return res.status(500).json({ error: 'Gemini API not configured on server' });
        }

        // STEP A: Generate Prompt and Song via Gemini
        const systemInstruction = `You are an expert social media strategist and AI image prompt engineer. 
Based on the user's reel Idea, Location, and Target Audience:
1. Suggest a specific, famous, or trending song that fits the location and audience perfectly to boost engagement.
2. Write a highly detailed, descriptive diffusion model image generation prompt to create the perfect clickbait/viral thumbnail for this reel. It must be highly visual, high quality, appealing to the target audience, and capture the essence of the location and idea.

Output your response strictly as a JSON object with two keys: "song_recommendation" (string) and "thumbnail_prompt" (string).`;

        const userPrompt = `Idea: ${idea}\nLocation: ${location}\nAudience: ${audience}`;

        const llmResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json'
            }
        });

        const aiResult = JSON.parse(llmResponse.text);
        const { song_recommendation, thumbnail_prompt } = aiResult;

        // STEP B: Generate Image (Fallback to Picsum since Pollinations is returning 530)
        // We use the idea as a seed so the random image is consistent for the same idea
        const seed = encodeURIComponent(idea).substring(0, 30);
        const imageUrl = `https://picsum.photos/seed/${seed}/800/450`;

        // Fetch the generated image into a buffer so we can send it to Presaige
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
            throw new Error(`Failed to fetch placeholder image: ${imageRes.status}`);
        }
        const imageBuffer = await imageRes.buffer();

        // If they provided a Presaige Key, let's auto-upload it to Presaige for them
        let presaigeAssetKey = null;
        if (presaigeKey) {
            // Get Presaige Upload URL
            const pRes = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                headers: { 'x-api-key': presaigeKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: `thumbnail_${Date.now()}.jpg`, content_type: 'image/jpeg' })
            });
            const pData = await pRes.json();

            if (pData.upload_url && pData.asset_key) {
                // PUT the image buffer directly to the S3 bucket
                const s3Res = await fetch(pData.upload_url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'image/jpeg' },
                    body: imageBuffer
                });

                if (s3Res.ok) {
                    presaigeAssetKey = pData.asset_key;
                } else {
                    console.error("Failed to PUT image to S3", await s3Res.text());
                }
            }
        }

        // Return everything to the frontend
        res.json({
            song_recommendation,
            thumbnail_prompt,
            image_url: imageUrl,
            presaige_asset_key: presaigeAssetKey
        });

    } catch (error) {
        console.error('Reel Generator Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend proxy server listening at http://localhost:${port}`);
});
