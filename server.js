import express from 'express';
import cors from 'cors';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Initialize Gemini — support multiple API keys as fallbacks
const geminiClients = [
    process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null,
    process.env.GEMINI_API_KEY_2 ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_2 }) : null,
].filter(Boolean);
const ai = geminiClients[0] || null; // keep `ai` alias for image gen
const HF_TOKEN = process.env.HF_TOKEN || null;
const PRESAIGE_KEY = process.env.PRESAIGE_KEY || null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use('/thumbnails', express.static(path.join(__dirname, 'public/thumbnails')));

// --- Force Download Endpoint ---
// Natively forces the browser to download the file instead of just viewing it
app.get('/api/download', (req, res) => {
    const file = req.query.file;
    if (!file) return res.status(400).send('Missing file parameter');

    // Prevent directory traversal
    const safeFile = path.basename(file);
    const filepath = path.join(__dirname, 'public/thumbnails', safeFile);

    if (fs.existsSync(filepath)) {
        res.download(filepath, `optimized_thumbnail_${Date.now()}${path.extname(filepath)}`);
    } else {
        res.status(404).send('File not found');
    }
});

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
        const { idea, location, audience } = req.body;
        const presaigeKey = PRESAIGE_KEY;

        if (!idea || !location || !audience) {
            return res.status(400).json({ error: 'Missing idea, location, or audience' });
        }

        if (!ai) {
            return res.status(500).json({ error: 'Gemini API not configured on server' });
        }

        // STEP A: Generate Prompt and Song via Gemini
        const systemInstruction = `You are an expert regional social media strategist and viral content creator with an encyclopedic knowledge of local and regional music trends, food culture, and audience psychology worldwide.

Your job is to suggest the PERFECT song for a social media reel. The perfect song must satisfy ALL THREE of the following dimensions simultaneously — never just one or two:

DIMENSION 1 — CONTENT/THEME MATCH: The song's vibe, lyrics, or mood must relate to the actual content of the reel. Think about what the reel IS showing.
  - If the reel is about food, eating, restaurants, or street food → prioritize songs that are literally about food, eating, or enjoyment of life (e.g., Tamil songs that mention biryani, samayal/cooking, or food euphoria). If no perfect food song exists, choose a song with a joyful, mouth-watering, celebratory mood that would feel natural playing over food visuals.
  - If the reel is about travel → use adventurous or wanderlust-evoking songs.
  - If the reel is about fitness → use high-energy motivational songs.
  - Always think: "Would this song make sense if someone heard it while watching this video?"

DIMENSION 2 — LOCATION & LANGUAGE MATCH: The song MUST be in the language of the location or widely popular there.
  - Pondicherry / Tamil Nadu, India → Tamil songs only (unless the reel specifically targets tourists). Look for songs from recent Tamil movies or Tamil Reels trends.
  - Kerala → Malayalam songs.
  - Mumbai / Maharashtra → Hindi or Marathi.
  - Japan → Japanese pop/city pop.
  - France → French pop.
  - Never suggest an English/Western song for a non-English-speaking regional location unless the audience is specifically international tourists.

DIMENSION 3 — AUDIENCE MATCH: The song must resonate with the target audience's age group, taste, and lifestyle.
  - Foodies / food lovers → pick something fun, sensory, and joyful.
  - Gen Z / teenagers → pick something viral and trending on Reels right now.
  - Older audience → pick something classic and familiar.

SONG PRIORITY ORDER: First look for songs that satisfy all 3 dimensions perfectly. If not found, satisfy Dimension 1 (content/theme) + Dimension 2 (location/language). Never compromise on Dimension 2 unless the location is explicitly international/generic.

Format your song recommendation as: "Song Title - Artist Name (Language) — [1 line explaining why this song fits]"

Also write a highly detailed image generation prompt for a viral thumbnail that captures the reel's idea, location aesthetic, and target audience's taste.

Output your response strictly as a JSON object with exactly two keys: "song_recommendation" (string) and "thumbnail_prompt" (string).`;

        const userPrompt = `Reel Idea / Content: ${idea}\nLocation (culture & language context): ${location}\nTarget Audience: ${audience}`;

        // Try all models on all API keys in waterfall order
        const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite'
        ];
        let aiResult = null;
        let llmUsed = 'none';

        if (geminiClients.length === 0) {
            throw new Error('No Gemini API keys configured. Please add GEMINI_API_KEY to .env');
        }

        outerLoop:
        for (let keyIdx = 0; keyIdx < geminiClients.length; keyIdx++) {
            const client = geminiClients[keyIdx];
            const keyLabel = `key${keyIdx + 1}`;
            for (const model of modelsToTry) {
                try {
                    const llmResponse = await client.models.generateContent({
                        model,
                        contents: userPrompt,
                        config: { systemInstruction, responseMimeType: 'application/json' }
                    });
                    aiResult = JSON.parse(llmResponse.text);
                    llmUsed = `${model} (${keyLabel})`;
                    console.log(`✅ LLM success with ${model} using ${keyLabel}`);
                    break outerLoop;
                } catch (modelErr) {
                    const msg = modelErr.message || '';
                    const isSkippable = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found') || msg.includes('not supported');
                    if (isSkippable) {
                        console.warn(`⚠️ ${model} (${keyLabel}) unavailable, trying next...`);
                    } else {
                        throw modelErr; // Truly unexpected — rethrow
                    }
                }
            }
        }

        if (!aiResult) {
            throw new Error('All Gemini API keys and models have exhausted their quota. Cannot generate reel idea dynamically.');
        }

        const { song_recommendation, thumbnail_prompt } = aiResult;

        // STEP B: Generate Thumbnail — Waterfall across free image generation services
        let imageBuffer;
        let imageUrl;
        let imageGenSuccess = false;

        // Attempt 1: FLUX.1-schnell via HuggingFace (PRIMARY — fast, high quality, authenticated)
        if (HF_TOKEN && !imageGenSuccess) {
            try {
                console.log('🎨 Generating thumbnail with FLUX.1-schnell...');
                const fluxRes = await fetch(
                    'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${HF_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            inputs: thumbnail_prompt.substring(0, 500),
                            parameters: { width: 800, height: 450 }
                        }),
                        signal: AbortSignal.timeout(45000) // FLUX can take up to 40s
                    }
                );
                if (fluxRes.ok && fluxRes.headers.get('content-type')?.includes('image')) {
                    imageBuffer = Buffer.from(await fluxRes.arrayBuffer());
                    const base64 = imageBuffer.toString('base64');
                    const mime = fluxRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
                    imageUrl = `data:${mime};base64,${base64}`;
                    imageGenSuccess = true;
                    console.log('✅ FLUX.1-schnell thumbnail generated successfully!');
                } else {
                    const errText = await fluxRes.text().catch(() => '');
                    console.warn('⚠️ FLUX.1-schnell returned:', fluxRes.status, errText.slice(0, 100));
                }
            } catch (e) {
                console.warn('⚠️ FLUX.1-schnell failed:', e.message?.slice(0, 100));
            }
        }

        // Attempt 2: Gemini Imagen 3 via generateImages (correct SDK call)
        if (ai && !imageGenSuccess) {
            try {
                const imagenRes = await ai.models.generateImages({
                    model: 'imagen-3.0-generate-002',
                    prompt: thumbnail_prompt,
                    config: { numberOfImages: 1, aspectRatio: '16:9' }
                });
                const imgData = imagenRes.generatedImages?.[0]?.image?.imageBytes;
                if (imgData) {
                    imageBuffer = Buffer.from(imgData, 'base64');
                    imageUrl = `data:image/jpeg;base64,${imgData}`;
                    imageGenSuccess = true;
                    console.log('✅ Imagen 3 thumbnail generated');
                }
            } catch (e) {
                console.warn('⚠️ Imagen 3 failed:', e.message?.slice(0, 100));
            }
        }

        // Attempt 2: Pollinations.ai (re-try — sometimes it's up)
        if (!imageGenSuccess) {
            try {
                const encodedPrompt = encodeURIComponent(thumbnail_prompt.substring(0, 400));
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=450&nologo=true`;
                const polRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(20000) });
                if (polRes.ok && polRes.headers.get('content-type')?.includes('image')) {
                    imageBuffer = Buffer.from(await polRes.arrayBuffer());
                    const base64 = imageBuffer.toString('base64');
                    imageUrl = `data:image/jpeg;base64,${base64}`;
                    imageGenSuccess = true;
                    console.log('✅ Pollinations.ai thumbnail generated');
                } else {
                    console.warn('⚠️ Pollinations returned:', polRes.status);
                }
            } catch (e) {
                console.warn('⚠️ Pollinations failed:', e.message?.slice(0, 80));
            }
        }

        // Attempt 3: HuggingFace Router (updated URL for 2025)
        if (!imageGenSuccess) {
            try {
                const hfRes = await fetch(
                    'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(HF_TOKEN ? { 'Authorization': `Bearer ${HF_TOKEN}` } : {})
                        },
                        body: JSON.stringify({ inputs: thumbnail_prompt.substring(0, 500) }),
                        signal: AbortSignal.timeout(30000)
                    }
                );
                if (hfRes.ok && hfRes.headers.get('content-type')?.includes('image')) {
                    imageBuffer = Buffer.from(await hfRes.arrayBuffer());
                    const base64 = imageBuffer.toString('base64');
                    imageUrl = `data:image/png;base64,${base64}`;
                    imageGenSuccess = true;
                    console.log('✅ HuggingFace SDXL thumbnail generated');
                } else {
                    const errText = await hfRes.text().catch(() => '');
                    console.warn('⚠️ HuggingFace returned:', hfRes.status, errText.slice(0, 80));
                }
            } catch (e) {
                console.warn('⚠️ HuggingFace failed:', e.message?.slice(0, 80));
            }
        }

        // Attempt 4: Picsum placeholder (always reliable, consistent random photo)
        if (!imageGenSuccess) {
            console.warn('⚠️ All AI image services unavailable. Using Picsum placeholder.');
            const seed = idea.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'reel';
            const picsumUrl = `https://picsum.photos/seed/${seed}/800/450`;
            const picsumRes = await fetch(picsumUrl);
            if (!picsumRes.ok) throw new Error(`Picsum fallback failed: ${picsumRes.status}`);
            imageBuffer = Buffer.from(await picsumRes.arrayBuffer());
            imageUrl = picsumUrl;
        }

        // ── STEP C: Upload image to Presaige ──────────────────────────────────
        let presaigeAssetKey = null;
        let scores = null;

        if (imageBuffer) {
            let ext = 'jpg'; // Default to JPEG
            // Sniff the magic bytes to detect actual image format
            if (imageBuffer.length > 3 && imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
                ext = 'png';
            } else if (imageBuffer.length > 3 && imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) {
                ext = 'webp';
            }

            const filename = `thumbnail_${Date.now()}.${ext}`;
            const filepath = path.join(__dirname, 'public/thumbnails', filename);
            fs.writeFileSync(filepath, imageBuffer);
            imageUrl = `/thumbnails/${filename}`;
            console.log(`✅ Saved thumbnail locally: ${filepath}`);
        }

        if (presaigeKey && imageBuffer) {
            try {
                const pRes = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    headers: { 'x-api-key': presaigeKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: `thumbnail_${Date.now()}.jpg`, content_type: 'image/jpeg' })
                });
                const pData = await pRes.json();

                if (pData.upload_url && pData.asset_key) {
                    const s3Res = await fetch(pData.upload_url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'image/jpeg' },
                        body: imageBuffer
                    });

                    if (s3Res.ok) {
                        presaigeAssetKey = pData.asset_key;
                        console.log('✅ Image uploaded to Presaige:', presaigeAssetKey);
                    } else {
                        console.error('Failed to PUT image to S3:', await s3Res.text());
                    }
                }
            } catch (uploadErr) {
                console.warn('⚠️ Presaige upload failed:', uploadErr.message);
            }
        }

        // ── STEP D: Submit score job + poll for result ─────────────────────────
        if (presaigeKey && presaigeAssetKey) {
            try {
                console.log('⏳ Submitting Presaige score job...');
                const jobRes = await fetch(`${API_BASE}/score`, {
                    method: 'POST',
                    headers: { 'x-api-key': presaigeKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asset_key: presaigeAssetKey, score_type: 'detailed' })
                });
                const jobData = await jobRes.json();
                const jobId = jobData.job_id;

                if (jobId) {
                    console.log('⏳ Polling Presaige job:', jobId);
                    let attempts = 0;
                    while (attempts < 20) {
                        await new Promise(r => setTimeout(r, 3000));
                        const pollRes = await fetch(`${API_BASE}/score/${jobId}`, {
                            headers: { 'x-api-key': presaigeKey }
                        });
                        const pollData = await pollRes.json();
                        if (pollData.status === 'complete') {
                            // Helper to recursively flatten nested scores object 
                            // e.g. { readiness: 6, subcategories: { esthetic: 8, framing: 7 } } -> { readiness: 6, esthetic: 8, framing: 7 }
                            const flattenScores = (obj) => {
                                let result = {};
                                for (const key in obj) {
                                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                                        Object.assign(result, flattenScores(obj[key]));
                                    } else if (typeof obj[key] === 'number') {
                                        result[key] = obj[key];
                                    }
                                }
                                return result;
                            };
                            scores = flattenScores(pollData.scores);
                            console.log('✅ Presaige scoring complete:', scores);
                            break;
                        }
                        attempts++;
                    }
                }
            } catch (scoreErr) {
                console.warn('⚠️ Presaige scoring failed:', scoreErr.message);
            }
        }

        // ── Return everything to frontend in one shot ──────────────────────────
        res.json({
            song_recommendation,
            thumbnail_prompt,
            image_url: imageUrl, // This is now a relative path like /thumbnails/xyz.jpg
            presaige_asset_key: presaigeAssetKey,
            scores,
        });

    } catch (error) {
        console.error('Reel Generator Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── NEW ENDPOINT: Fetch Presaige Recommendations ───────────────────────────
app.post('/api/get-recommendations', async (req, res) => {
    try {
        const { presaige_asset_key } = req.body;
        const presaigeKey = process.env.PRESAIGE_KEY;

        if (!presaigeKey) return res.status(500).json({ error: 'Missing Presaige API Key on server' });
        if (!presaige_asset_key) return res.status(400).json({ error: 'Missing presaige_asset_key' });

        console.log('⏳ Submitting Presaige recommendations job...');
        const jobRes = await fetch(`${API_BASE}/recommendations`, {
            method: 'POST',
            headers: { 'x-api-key': presaigeKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_key: presaige_asset_key })
        });

        const jobData = await jobRes.json();
        const jobId = jobData.job_id;

        if (!jobId) {
            throw new Error('Failed to create recommendations job. Limit reached or asset error.');
        }

        console.log('⏳ Polling Presaige recommendations job:', jobId);
        let attempts = 0;
        while (attempts < 20) {
            await new Promise(r => setTimeout(r, 4000)); // slightly longer poll
            const pollRes = await fetch(`${API_BASE}/recommendations/${jobId}`, {
                headers: { 'x-api-key': presaigeKey }
            });
            const pollData = await pollRes.json();
            if (pollData.status === 'complete') {
                console.log('✅ Presaige recommendations complete');
                return res.json({ recommendations: pollData.actionable_feedback || pollData.result || {} });
            }
            if (pollData.status === 'failed') {
                console.warn('⚠️ Presaige failed to generate recommendations for this image. Falling back to frontend defaults.');
                return res.json({ recommendations: {} });
            }
            attempts++;
        }
        console.warn('⚠️ Recommendations polling timed out. Falling back to frontend defaults.');
        return res.json({ recommendations: {} });

    } catch (error) {
        console.error('Recommendations Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ── NEW ENDPOINT: Refine Thumbnail based on AI Recommendations ─────────
app.post('/api/refine', async (req, res) => {
    try {
        const { idea, location, audience, recommendations, original_prompt } = req.body;
        const presaigeKey = process.env.PRESAIGE_KEY;

        console.log('🔄 Initating AI Thumbnail Refinement Pipeline...');

        // ── STEP A: Ask Gemini to rewrite the prompt using the recommendations ──
        const systemInstruction = `You are an expert graphic designer and AI prompt engineer specializing in creating viral, high-scoring YouTube/Instagram reel thumbnails.
Your task is to take a pre-existing image generation prompt and UPGRADE it based on an AI critic's recommendations.

ORIGINAL CORE CONSTRAINTS:
- Reel Idea: ${idea}
- Location/Vibe: ${location}

THE ORIGINAL PROMPT (Which generated a slightly flawed image):
"${original_prompt || "N/A"}"

CRITIC'S RECOMMENDATIONS TO FIX:
${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

INSTRUCTIONS:
1. Heavily base your new prompt on the "ORIGINAL PROMPT" to preserve what already worked.
2. Inject and modify the prompt to aggressively apply the "CRITIC'S RECOMMENDATIONS". 
3. If the critic asks for more contrast, better lighting, or specific layout changes, explicitly write those instructions into the new prompt.
4. Add powerful aesthetic keywords to guarantee a high-quality render: "masterpiece, 4k resolution, cinematic lighting, highly detailed, vibrant colors, eye-catching, high contrast, perfect composition, professional photography style".
5. Format the output strictly as a single, highly descriptive prompt string for an AI image generator (like Midjourney or Flux). No quotes, no markdown wrappers, no introductory text, no JSON. Max 600 characters.`;

        let optimizedPrompt = '';
        let promptSuccess = false;

        // Try using Gemini to rewrite the prompt with fallback
        if (geminiClients.length > 0) {
            const modelsToTry = [
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-2.0-flash',
                'gemini-2.0-flash-lite'
            ];

            outerLoop:
            for (let keyIdx = 0; keyIdx < geminiClients.length; keyIdx++) {
                const client = geminiClients[keyIdx];
                for (const model of modelsToTry) {
                    try {
                        const llmResponse = await client.models.generateContent({
                            model,
                            contents: `Rewrite the image generation prompt to fix the flaws.`,
                            config: { systemInstruction }
                        });
                        optimizedPrompt = llmResponse.text.trim();
                        promptSuccess = true;
                        console.log(`✅ Gemini Rewrote Prompt using ${model}:`, optimizedPrompt);
                        break outerLoop;
                    } catch (e) {
                        console.warn(`⚠️ ${model} refine failed, trying next...`);
                    }
                }
            }
        }

        if (!promptSuccess) {
            return res.status(500).json({ error: 'All Gemini API keys and models exhausted quota' });
        }

        // ── STEP B: Generate the new Image ──────────────────────────────────────
        let imageGenSuccess = false;
        let imageBuffer = null;
        let imageUrl = '';

        // Attempt 1: FLUX.1-schnell via HuggingFace (PRIMARY — fast, high quality, authenticated)
        if (HF_TOKEN && !imageGenSuccess) {
            try {
                console.log('🎨 Generating refined thumbnail with FLUX.1-schnell...');
                const fluxRes = await fetch(
                    'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${HF_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            inputs: optimizedPrompt.substring(0, 500),
                            parameters: { width: 800, height: 450 }
                        }),
                        signal: AbortSignal.timeout(45000)
                    }
                );
                if (fluxRes.ok && fluxRes.headers.get('content-type')?.includes('image')) {
                    imageBuffer = Buffer.from(await fluxRes.arrayBuffer());
                    imageUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                    imageGenSuccess = true;
                    console.log('✅ FLUX.1-schnell refined thumbnail generated!');
                } else {
                    console.warn('⚠️ FLUX.1-schnell refined returned:', fluxRes.status);
                }
            } catch (e) { console.warn('⚠️ FLUX.1-schnell refined failed:', e.message?.slice(0, 50)); }
        }

        // Attempt 2: Pollinations.ai (re-try)
        if (!imageGenSuccess) {
            try {
                const encodedPrompt = encodeURIComponent(optimizedPrompt.substring(0, 400));
                const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=450&nologo=true`;
                const polRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(20000) });
                if (polRes.ok && polRes.headers.get('content-type')?.includes('image')) {
                    imageBuffer = Buffer.from(await polRes.arrayBuffer());
                    imageUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                    imageGenSuccess = true;
                    console.log('✅ Pollinations refined thumbnail generated');
                }
            } catch (e) {
                console.warn('⚠️ Pollinations refined failed:', e.message?.slice(0, 50));
            }
        }

        // Attempt 3: HuggingFace Router SDXL
        if (!imageGenSuccess) {
            try {
                const hfRes = await fetch(
                    'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(HF_TOKEN ? { 'Authorization': `Bearer ${HF_TOKEN}` } : {})
                        },
                        body: JSON.stringify({ inputs: optimizedPrompt.substring(0, 500) }),
                        signal: AbortSignal.timeout(30000)
                    }
                );
                if (hfRes.ok && hfRes.headers.get('content-type')?.includes('image')) {
                    imageBuffer = Buffer.from(await hfRes.arrayBuffer());
                    imageUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
                    imageGenSuccess = true;
                    console.log('✅ Refined image generated via SDXL');
                }
            } catch (e) { console.warn('⚠️ HuggingFace refined gen failed', e.message?.slice(0, 50)); }
        }

        // Attempt 4: Placeholder (ABSOLUTE LAST RESORT)
        if (!imageGenSuccess) {
            console.warn('⚠️ All image generators failed for refinement. Using Picsum fallback.');
            const picsumRes = await fetch(`https://picsum.photos/seed/${Date.now()}/800/450`);
            imageBuffer = Buffer.from(await picsumRes.arrayBuffer());
            console.log('✅ Refined image used placeholder');
        }

        // ── STEP C: Save Locally & Upload to Presaige ──────────────────────────
        let ext = 'jpg';
        if (imageBuffer.length > 3 && imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) ext = 'png';
        else if (imageBuffer.length > 3 && imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) ext = 'webp';

        const filename = `refined_${Date.now()}.${ext}`;
        const filepath = path.join(__dirname, 'public/thumbnails', filename);
        fs.writeFileSync(filepath, imageBuffer);
        imageUrl = `/thumbnails/${filename}`;

        let presaigeAssetKey = null;
        let newScores = null;

        if (presaigeKey) {
            try {
                const pRes = await fetch(`${API_BASE}/upload`, {
                    method: 'POST',
                    headers: { 'x-api-key': presaigeKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content_type: 'image/jpeg' })
                });
                const pData = await pRes.json();

                if (pData.upload_url && pData.asset_key) {
                    const s3Res = await fetch(pData.upload_url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'image/jpeg' },
                        body: imageBuffer
                    });
                    if (s3Res.ok) {
                        presaigeAssetKey = pData.asset_key;

                        // Submit Score Job
                        const jobRes = await fetch(`${API_BASE}/score`, {
                            method: 'POST',
                            headers: { 'x-api-key': presaigeKey, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ asset_key: presaigeAssetKey, score_type: 'detailed' })
                        });
                        const jobData = await jobRes.json();
                        const jobId = jobData.job_id;

                        if (jobId) {
                            let attempts = 0;
                            while (attempts < 20) {
                                await new Promise(r => setTimeout(r, 3000));
                                const pollRes = await fetch(`${API_BASE}/score/${jobId}`, {
                                    headers: { 'x-api-key': presaigeKey }
                                });
                                const pollData = await pollRes.json();
                                if (pollData.status === 'complete') {
                                    const flattenScores = (obj) => {
                                        let result = {};
                                        for (const k in obj) {
                                            if (typeof obj[k] === 'object' && obj[k] !== null) Object.assign(result, flattenScores(obj[k]));
                                            else if (typeof obj[k] === 'number') result[k] = obj[k];
                                        }
                                        return result;
                                    };
                                    newScores = flattenScores(pollData.scores);
                                    break;
                                }
                                attempts++;
                            }
                        }
                    }
                }
            } catch (err) { console.warn('⚠️ Refined scoring failed:', err.message); }
        }

        res.json({
            thumbnail_prompt: optimizedPrompt,
            image_url: imageUrl,
            presaige_asset_key: presaigeAssetKey,
            scores: newScores,
        });

    } catch (error) {
        console.error('Refine Endpoint Error:', error);
        res.status(500).json({ error: error.message });
    }
});
app.listen(port, () => {
    console.log(`Backend proxy server listening at http://localhost:${port}`);
});
