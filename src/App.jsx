import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = '/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseSong(raw = '') {
    const [songPart = '', reasonPart = ''] = raw.split(' — ');
    const dashIdx = songPart.lastIndexOf(' - ');
    return {
        name: dashIdx !== -1 ? songPart.substring(0, dashIdx).trim() : songPart,
        artist: dashIdx !== -1 ? songPart.substring(dashIdx + 3).trim() : '',
        reason: reasonPart || 'Chosen for its perfect match with your reel concept.',
    };
}

const SCORE_LABELS = {
    wow_factor: 'Wow Factor',
    readiness_score: 'Readiness',
    elite_score: 'Elite Score',
    buzz_index: 'Buzz Index',
    elite_engagement_score: 'Engagement',
    benchmark_score: 'Benchmark',
    presaige_score: 'Presaige Score',
};

const SCORE_COLORS = {
    wow_factor: '#F58529',
    readiness_score: '#22c55e',
    elite_score: '#8134AF',
    buzz_index: '#515BD4',
    elite_engagement_score: '#DD2A7B',
    benchmark_score: '#06b6d4',
    presaige_score: '#F59E0B',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function GradientText({ children, style = {} }) {
    return (
        <span style={{
            background: 'linear-gradient(135deg, #F58529, #DD2A7B, #8134AF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            ...style,
        }}>
            {children}
        </span>
    );
}

function LogoIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#F58529" />
                    <stop offset="50%" stopColor="#DD2A7B" />
                    <stop offset="100%" stopColor="#8134AF" />
                </linearGradient>
            </defs>
            <rect x="1" y="1" width="26" height="26" rx="8" stroke="url(#lg)" strokeWidth="2" fill="none" />
            <circle cx="14" cy="14" r="6" stroke="url(#lg)" strokeWidth="2" fill="none" />
            <circle cx="20.5" cy="7.5" r="1.5" fill="url(#lg)" />
        </svg>
    );
}

function InputField({ label, placeholder, value, onChange, as = 'input' }) {
    const Tag = as;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: '#666', textTransform: 'uppercase' }}>
                {label}
            </label>
            <Tag
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                rows={as === 'textarea' ? 3 : undefined}
                style={{
                    background: '#111',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#f5f5f5',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'Inter, sans-serif',
                    resize: as === 'textarea' ? 'none' : undefined,
                    transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(221,42,123,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
        </div>
    );
}

function ScoreBar({ value, color }) {
    const pct = Math.min(100, (value / 10) * 100);
    return (
        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                style={{ height: '100%', background: color, borderRadius: 99 }}
            />
        </div>
    );
}

function ScoreCard({ label, value, color, hero = false }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
                background: hero ? `linear-gradient(135deg, ${color}18, #111)` : '#111',
                border: `1px solid ${hero ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: hero ? 14 : 10,
                padding: hero ? '18px 20px' : '10px 12px',
                marginBottom: hero ? 10 : 0,
            }}
        >
            <div style={{ fontSize: hero ? 11 : 9, color: hero ? color : '#444', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: hero ? 6 : 3 }}>
                {label}
            </div>
            <div style={{ fontSize: hero ? 36 : 18, fontWeight: 800, color, lineHeight: 1 }}>
                {typeof value === 'number' ? value.toFixed(1) : value}
                <span style={{ fontSize: hero ? 14 : 10, fontWeight: 500, color: '#444', marginLeft: 2 }}>/10</span>
            </div>
            <ScoreBar value={value} color={color} />
        </motion.div>
    );
}

function SongCard({ song }) {
    const [open, setOpen] = useState(false);
    const { name, artist, reason } = song;
    const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' ' + artist + ' official audio')}`;
    const handleSongClick = () => window.open(youtubeUrl, '_blank');

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: '#111',
                border: '1px solid rgba(245,133,41,0.2)',
                borderRadius: 12,
                padding: '16px',
                marginBottom: 12,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #F58529, #DD2A7B)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                }}>🎵</div>
                <div
                    onClick={handleSongClick}
                    title="Play on YouTube"
                    style={{ cursor: 'pointer' }}
                >
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f5f5f5', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {name}
                        <span style={{ fontSize: 10, color: '#FF0000', fontWeight: 700, background: 'rgba(255,0,0,0.1)', padding: '1px 5px', borderRadius: 4 }}>▶ YT</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{artist}</div>
                </div>
            </div>
            <motion.button
                onClick={() => setOpen(!open)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                style={{
                    border: `1px ${open ? 'solid' : 'dashed'} rgba(221,42,123,0.5)`,
                    background: open ? 'rgba(221,42,123,0.1)' : 'transparent',
                    borderRadius: 20,
                    padding: '4px 12px',
                    color: '#DD2A7B',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontFamily: 'Inter, sans-serif',
                    transition: 'all 0.2s',
                }}
            >
                <motion.span animate={{ rotate: open ? 20 : 0, scale: open ? 1.2 : 1 }} transition={{ duration: 0.3 }}>
                    💡
                </motion.span>
                {open ? 'Hide reason' : 'Want to know why?'}
            </motion.button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{
                            marginTop: 10,
                            padding: '10px 14px',
                            background: 'rgba(221,42,123,0.07)',
                            borderLeft: '3px solid #DD2A7B',
                            borderRadius: '0 8px 8px 0',
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: '#aaa',
                        }}>
                            {reason}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function DownloadButton({ imageUrl }) {
    if (!imageUrl) return null;

    // Extract the raw filename from wherever the URL comes from
    // imageUrl is now a relative path like /thumbnails/thumbnail_123.jpg
    let rawFilename = null;
    if (imageUrl.startsWith('/thumbnails/')) {
        rawFilename = imageUrl.replace('/thumbnails/', '');
    } else if (imageUrl.includes('/thumbnails/')) {
        rawFilename = imageUrl.split('/thumbnails/').pop();
    }

    if (!rawFilename) return null;

    const ext = rawFilename.split('.').pop() || 'jpg';
    const downloadFilename = `optimized_thumbnail.${ext}`;
    // Point to the Vite-proxied download endpoint (same-origin, so download attribute works)
    const downloadHref = `/api/download?file=${rawFilename}`;

    return (
        <motion.a
            href={downloadHref}
            download={downloadFilename}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 20, padding: '6px 14px',
                color: '#aaa', fontSize: 12, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif', fontWeight: 500,
                textDecoration: 'none',
            }}
        >
            ⬇ Download Thumbnail
        </motion.a>
    );
}

function ReelPhonePreview({ imageUrl, loading }) {
    return (
        <div style={{
            position: 'relative',
            width: 220,
            margin: '0 auto',
        }}>
            {/* Phone frame */}
            <div style={{
                background: '#1a1a1a',
                border: '2px solid #2a2a2a',
                borderRadius: 28,
                padding: '6px 6px',
                boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
            }}>
                {/* Screen */}
                <div style={{
                    borderRadius: 32,
                    overflow: 'hidden',
                    aspectRatio: '9/16',
                    background: '#0d0d0d',
                    position: 'relative',
                }}>
                    {/* Dynamic Island */}
                    <div style={{
                        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                        width: 80, height: 26, background: '#000', borderRadius: 99, zIndex: 50,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }} />
                    {loading ? (
                        <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 12,
                        }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    border: '3px solid transparent',
                                    borderTopColor: '#DD2A7B',
                                    borderRightColor: '#F58529',
                                }}
                            />
                            <span style={{ fontSize: 11, color: '#555' }}>Generating...</span>
                        </div>
                    ) : imageUrl ? (
                        <motion.img
                            key={imageUrl}
                            initial={{ opacity: 0, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5 }}
                            src={imageUrl}
                            alt="Generated thumbnail"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                    ) : (
                        <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 8, color: '#333',
                        }}>
                            <span style={{ fontSize: 28 }}>🖼️</span>
                            <span style={{ fontSize: 11 }}>Your stunning thumbnail</span>
                            <span style={{ fontSize: 10, color: '#222' }}>will appear here</span>
                        </div>
                    )}
                </div>
                {/* Home indicator */}
                <div style={{
                    width: 50, height: 4, background: '#2a2a2a',
                    borderRadius: 99, margin: '10px auto 0',
                }} />
            </div>
        </div>
    );
}

function StatusPill({ status, type }) {
    if (!status) return null;
    const colors = {
        success: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
        error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' },
        loading: { bg: 'rgba(245,133,41,0.12)', border: 'rgba(245,133,41,0.3)', text: '#F58529' },
    };
    const c = colors[type] || colors.loading;
    return (
        <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                padding: '6px 14px',
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 99,
                fontSize: 12,
                color: c.text,
                textAlign: 'center',
                marginBottom: 12,
                fontWeight: 500,
            }}
        >
            {type === 'loading' && (
                <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    style={{ marginRight: 6 }}
                >●</motion.span>
            )}
            {status}
        </motion.div>
    );
}

export default function App() {
    const [idea, setIdea] = useState('');
    const [location, setLocation] = useState('');
    const [audience, setAudience] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [statusType, setStatusType] = useState('loading');
    const [result, setResult] = useState(null); // { song, imageUrl, scores, presaige_asset_key }

    // New states for Recommendations feature
    const [recommendations, setRecommendations] = useState(null);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [refining, setRefining] = useState(false); // Controls the AI refinement loop

    const abortRef = useRef(null);

    const canGenerate = idea.trim() && location.trim() && audience.trim() && !loading;

    async function generate() {
        setLoading(true);
        setResult(null);
        setRecommendations(null); // Clear previous recommendations
        setStatus('AI is brainstorming your thumbnail...', 'loading');
        setStatusType('loading');

        try {
            const res = await fetch(`${API_BASE}/generate-reel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idea, location, audience }),
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Pipeline failed: ${res.status} ${err}`);
            }

            const data = await res.json();
            const song = parseSong(data.song_recommendation);

            let finalScores = data.scores || null;

            setResult({
                song,
                imageUrl: data.image_url,
                scores: finalScores,
                presaige_asset_key: data.presaige_asset_key || null,
                thumbnail_prompt: data.thumbnail_prompt
            });
            setStatus(data.scores ? 'Thumbnail Successfully Optimized! ✨' : 'Thumbnail generated! (Presaige scoring unavailable)', 'success');
            setStatusType('success');
            setRecommendations(null); // Reset recs on new generation
        } catch (err) {
            setStatus(err.message, 'error');
            setStatusType('error');
        } finally {
            setLoading(false);
        }
    }

    async function fetchRecommendations() {
        if (!result?.presaige_asset_key) return;
        setLoadingRecs(true);
        setStatus('Fetching expert design recommendations from Presaige API...', 'info');

        try {
            const res = await fetch('/api/get-recommendations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ presaige_asset_key: result.presaige_asset_key })
            });
            const data = await res.json();

            if (data.error || !data.recommendations) {
                throw new Error("API returned no recommendations data.");
            }

            // data.recommendations is an object grouping like {"Quick Wins": [ {HEADER, APPROACH} ]}
            let parsedRecs = [];
            if (typeof data.recommendations === 'object' && !Array.isArray(data.recommendations)) {
                for (const [category, items] of Object.entries(data.recommendations)) {
                    if (Array.isArray(items)) {
                        items.forEach(item => {
                            if (item.HEADER && item.APPROACH) {
                                parsedRecs.push(`**${item.HEADER}**: ${item.APPROACH}`);
                            }
                        });
                    }
                }
            }

            if (parsedRecs.length === 0) {
                // Fallback only if the parsed payload is genuinely empty
                setRecommendations([
                    "**Increase Contrast:** The thumbnail is slightly flat. Boost contrast by 15% to make the subject pop more in the feed.",
                    "**Rule of Thirds:** The main subject is too centered. Shift the core action slightly to the upper third to draw the eye naturally.",
                    "**Increase Saturation:** A 10% bump in saturation, especially on vibrant colors, will make this thumbnail far more scroll-stopping.",
                ]);
                setStatus('Recommendations ready (Used Smart Fallback due to API limit)', 'success');
            } else {
                // Limit to top 4 recommendations for clean UI
                setRecommendations(parsedRecs.slice(0, 4));
                setStatus('Genuine AI Recommendations ready!', 'success');
            }

        } catch (err) {
            setStatus('Failed to fetch recommendations: ' + err.message, 'error');
        } finally {
            setLoadingRecs(false);
        }
    }

    async function refineThumbnail() {
        if (!result || !recommendations) return;
        setRefining(true);
        setStatus('AI is auto-refining the thumbnail based on feedback...', 'loading');
        setStatusType('loading');

        try {
            const res = await fetch('/api/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idea,
                    location,
                    audience,
                    recommendations,
                    original_prompt: result.thumbnail_prompt
                })
            });

            if (!res.ok) {
                throw new Error(`Refinement failed: ${res.status}`);
            }

            const data = await res.json();

            // Update the existing result object with the new image and new scores
            setResult(prev => ({
                ...prev,
                imageUrl: data.image_url,
                presaige_asset_key: data.presaige_asset_key,
                scores: data.scores || prev.scores
            }));

            // Clear recommendations so the loop can start fresh if the new score is still under 9
            setRecommendations(null);
            setStatus('✨ Thumbnail Refined! New image & scores generated.', 'success');
            setStatusType('success');

        } catch (err) {
            setStatus('Failed to refine thumbnail: ' + err.message, 'error');
            setStatusType('error');
        } finally {
            setRefining(false);
        }
    }

    const sortedScores = result?.scores
        ? Object.entries(result.scores).sort((a, b) => b[1] - a[1])
        : [];

    // Check if hero score is 9+
    const heroScoreValue = sortedScores.find(([k]) => k === 'presaige_score')?.[1];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: '#080808',
            overflow: 'hidden',
        }}>
            {/* ── Header ── */}
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                height: 54,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LogoIcon />
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
                        vibe<GradientText>Architect</GradientText>
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 12, color: '#444' }}>TrojanHacks 2026</span>
                    <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #990000, #FFCC00)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13,
                    }}>✌️</div>
                </div>
            </header>

            {/* ── Three-column body ── */}
            <div style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '300px 1fr 320px',
                overflow: 'hidden',
            }}>

                {/* ━━ LEFT — Input Panel ━━ */}
                <aside style={{
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    overflowY: 'auto',
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f5f5f5', marginBottom: 2 }}>Thumbnail Brief</div>
                        <div style={{ fontSize: 11, color: '#444' }}>Tell the AI about your next thumbnail</div>
                    </div>

                    <InputField
                        label="What's the thumbnail about?"
                        placeholder="e.g. Street biryani review at Sree Annapoorna"
                        value={idea}
                        onChange={setIdea}
                        as="textarea"
                    />
                    <InputField
                        label="Location"
                        placeholder="e.g. Pondicherry, Tamil Nadu"
                        value={location}
                        onChange={setLocation}
                    />
                    <InputField
                        label="Target Audience"
                        placeholder="e.g. Foodies, college students"
                        value={audience}
                        onChange={setAudience}
                    />

                    {/* Generate button */}
                    <motion.button
                        onClick={generate}
                        disabled={!canGenerate}
                        whileHover={canGenerate ? { scale: 1.02 } : {}}
                        whileTap={canGenerate ? { scale: 0.97 } : {}}
                        style={{
                            padding: '13px 0',
                            borderRadius: 12,
                            border: 'none',
                            background: canGenerate
                                ? 'linear-gradient(135deg, #F58529, #DD2A7B, #8134AF)'
                                : '#1a1a1a',
                            color: canGenerate ? '#fff' : '#333',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: canGenerate ? 'pointer' : 'not-allowed',
                            fontFamily: 'Inter, sans-serif',
                            letterSpacing: '-0.01em',
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'background 0.3s',
                        }}
                    >
                        {loading ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <motion.span
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    style={{ display: 'inline-block' }}
                                >⟳</motion.span>
                                Generating...
                            </span>
                        ) : '✨ Generate Optimized Thumbnail'}
                    </motion.button>

                    {/* Divider */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                        <div style={{ fontSize: 11, color: '#333', marginBottom: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Powered by</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                                { icon: '🧠', label: 'Google Gemini', sub: 'Song & prompt generation' },
                                { icon: '🎨', label: 'FLUX.1-schnell', sub: 'AI thumbnail generation' },
                                { icon: '📊', label: 'Presaige API', sub: 'Viral score analysis' },
                            ].map(item => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{item.label}</div>
                                        <div style={{ fontSize: 10, color: '#333' }}>{item.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* ━━ CENTER — Preview ━━ */}
                <main style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    gap: 20,
                    overflow: 'hidden',
                }}>
                    <AnimatePresence mode="wait">
                        {status && (
                            <StatusPill key={status} status={status} type={statusType} />
                        )}
                    </AnimatePresence>

                    <ReelPhonePreview imageUrl={result?.imageUrl} loading={loading} />

                    {/* Download Button moved ABOVE the song for clear clicking */}
                    {result?.imageUrl && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                            <DownloadButton imageUrl={result.imageUrl} idea="thumbnail" />
                        </motion.div>
                    )}

                    {result?.song && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                        >
                            <SongCard song={result.song} />
                        </motion.div>
                    )}

                    {!result && !loading && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{ fontSize: 12, color: '#2a2a2a', textAlign: 'center', maxWidth: 200 }}
                        >
                            Fill in your brief and hit generate to preview your AI-optimized thumbnail
                        </motion.p>
                    )}
                </main>

                {/* ━━ RIGHT — Scores ━━ */}
                <aside style={{
                    padding: '20px 16px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f5f5f5', marginBottom: 2 }}>Presaige Analysis</div>
                        <div style={{ fontSize: 11, color: '#444' }}>Viral potential scores</div>
                    </div>

                    <AnimatePresence>
                        {sortedScores.length > 0 ? (
                            <>
                                {/* Hero: Presaige Score at top */}
                                {(() => {
                                    const hero = sortedScores.find(([k]) => k === 'presaige_score') || sortedScores[0];
                                    return (
                                        <motion.div key={hero[0]} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                                            <ScoreCard
                                                label={SCORE_LABELS[hero[0]] || hero[0]}
                                                value={hero[1]}
                                                color={SCORE_COLORS[hero[0]] || '#F59E0B'}
                                                hero
                                            />
                                        </motion.div>
                                    );
                                })()}
                                {/* Compact 2-column grid for all other scores */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    {sortedScores
                                        .filter(([k]) => k !== 'presaige_score')
                                        .map(([key, value], i) => (
                                            <motion.div
                                                key={key}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.1 + i * 0.05 }}
                                            >
                                                <ScoreCard
                                                    label={SCORE_LABELS[key] || key}
                                                    value={value}
                                                    color={SCORE_COLORS[key] || '#888'}
                                                />
                                            </motion.div>
                                        ))
                                    }
                                </div>

                                {/* ━━ RECOMMENDATIONS SECTION ━━ */}
                                {(() => {
                                    const heroScore = sortedScores.find(([k]) => k === 'presaige_score')?.[1];
                                    if (heroScore === undefined) return null;

                                    if (heroScore >= 9.0) {
                                        return (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
                                                marginTop: 10, padding: 12, background: 'rgba(52, 211, 153, 0.1)',
                                                border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: 10,
                                                color: '#34D399', fontSize: 13, textAlign: 'center', fontWeight: 600
                                            }}>
                                                ✨ This is already a fantastic thumbnail!
                                            </motion.div>
                                        );
                                    }

                                    return (
                                        <div style={{ marginTop: 10 }}>
                                            {!recommendations && (
                                                <button
                                                    onClick={fetchRecommendations}
                                                    disabled={loadingRecs || loading}
                                                    style={{
                                                        width: '100%', padding: '12px',
                                                        background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
                                                        color: 'white', border: 'none', borderRadius: 10,
                                                        fontSize: 13, fontWeight: 700, cursor: loadingRecs ? 'not-allowed' : 'pointer',
                                                        opacity: loadingRecs ? 0.7 : 1, transition: 'all 0.2s',
                                                    }}
                                                >
                                                    {loadingRecs ? 'Analyzing for Improvements...' : '💡 Get AI Recommendations to Improve Score'}
                                                </button>
                                            )}

                                            {recommendations && recommendations.length > 0 && (
                                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{
                                                    background: '#111', border: '1px solid rgba(255,255,255,0.06)',
                                                    borderRadius: 10, padding: 14, marginTop: 10
                                                }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f5f5f5', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ color: '#F59E0B' }}>💡</span> Actionable Feedback
                                                    </div>
                                                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#bbb', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {recommendations.map((rec, i) => (
                                                            <li key={i} dangerouslySetInnerHTML={{ __html: rec.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#fff">$1</strong>') }} />
                                                        ))}
                                                    </ul>
                                                </motion.div>
                                            )}

                                            {/* AUTO-REFINE THUMBNAIL BUTTON */}
                                            {recommendations && recommendations.length > 0 && (
                                                <motion.button
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.2 }}
                                                    onClick={refineThumbnail}
                                                    disabled={refining}
                                                    style={{
                                                        width: '100%', padding: '12px', marginTop: 10,
                                                        background: 'linear-gradient(135deg, #F58529, #DD2A7B)',
                                                        color: 'white', border: 'none', borderRadius: 10,
                                                        fontSize: 13, fontWeight: 800, cursor: refining ? 'not-allowed' : 'pointer',
                                                        opacity: refining ? 0.7 : 1, transition: 'all 0.2s',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                                    }}
                                                >
                                                    {refining ? (
                                                        <>
                                                            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>⟳</motion.span>
                                                            Refining Image...
                                                        </>
                                                    ) : (
                                                        '✨ Auto-Refine Thumbnail'
                                                    )}
                                                </motion.button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </>
                        ) : (
                            <div style={{
                                flex: 1, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: 10,
                                color: '#222', paddingTop: 60,
                            }}>
                                <span style={{ fontSize: 32 }}>📊</span>
                                <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
                                    Scores will appear here after generation
                                </span>
                            </div>
                        )}
                    </AnimatePresence>
                </aside>
            </div>
        </div>
    );
}
