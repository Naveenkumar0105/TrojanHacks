import fetch from 'node-fetch';

const API_KEY = "M5Q4wfHkDE1W8vxRRzsHp23iBbBBL3M7s4jHssw7";
const PROXY_BASE = "http://localhost:3000/api/proxy";

async function run() {
    try {
        console.log("1. Get Upload URL...");
        const upRes = await fetch(`${PROXY_BASE}/upload`, {
            method: 'POST',
            headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: "test.jpg", content_type: "image/jpeg" })
        });
        const upData = await upRes.json();
        console.log("Asset Key:", upData.asset_key);

        console.log("2. Submit Recommendations Job...");
        const jobRes = await fetch(`${PROXY_BASE}/recommendations`, {
            method: 'POST',
            headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_key: upData.asset_key })
        });
        const jobData = await jobRes.json();
        console.log("Job Status:", jobData);

        let pollUrl = jobData.poll_url;
        if (pollUrl.startsWith('/')) pollUrl = pollUrl.substring(1);
        
        console.log("3. Polling...");
        for (let i=0; i<10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(`${PROXY_BASE}/poll/${pollUrl}`, {
                headers: { 'x-api-key': API_KEY }
            });
            const pollData = await pollRes.json();
            console.log("Poll", i, pollData.status);
            if (pollData.status === 'complete' || pollData.status === 'failed') {
                console.log(JSON.stringify(pollData, null, 2));
                break;
            }
        }
    } catch(e) { console.error(e); }
}
run();
