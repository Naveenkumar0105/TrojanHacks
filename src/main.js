const testBtn = document.getElementById('testBtn');
const btnText = document.querySelector('.btn-text');
const loader = document.querySelector('.loader');

const reelIdeaInput = document.getElementById('reelIdea');
const reelLocationInput = document.getElementById('reelLocation');
const reelAudienceInput = document.getElementById('reelAudience');

const aiOutputs = document.getElementById('aiOutputs');
const songResult = document.getElementById('songResult');
const thumbResult = document.getElementById('thumbResult');

const beautifiedResult = document.getElementById('beautifiedResult');
const rawOutputDetails = document.getElementById('rawOutputDetails');
const resultJson = document.getElementById('resultJson');
const resultStatus = document.querySelector('.result-status');

// API Base URL (Point to our new local proxy server)
const API_BASE = 'http://localhost:3000/api';

// Ensure the json string is pretty printed
function prettyPrintJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// Attach the main flow to the test button
testBtn.addEventListener('click', runMainFlow);

// Main Test Function
async function runMainFlow() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const customBase = document.getElementById('endpointUrl').value.trim();
  const proxyBase = customBase || API_BASE;

  const idea = reelIdeaInput.value;
  const location = reelLocationInput.value;
  const audience = reelAudienceInput.value;

  if (!idea || !location || !audience) {
    showError("Please fill in Idea, Location, and Audience.");
    return;
  }

  // Update UI to loading
  setLoading(true);

  try {
    beautifiedResult.classList.add('hidden');
    aiOutputs.classList.add('hidden');
    rawOutputDetails.classList.add('hidden');

    // === Step 1: AI Brainstorming & Generation ===
    resultStatus.textContent = `Brainstorming with Gemini & Generative AI...`;
    resultStatus.className = 'result-status';
    resultJson.textContent = 'Generating...';

    const generateResponse = await fetch(`${proxyBase}/generate-reel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idea,
        location,
        audience,
        presaigeKey: apiKey
      })
    });

    if (!generateResponse.ok) {
      let errBody = await generateResponse.text().catch(() => "");
      throw new Error(`AI Pipeline failed: ${generateResponse.status} ${errBody}`);
    }

    const genData = await generateResponse.json();

    // Parse and display song recommendation
    // Format: "Song Title - Artist Name (Language) — reason"
    const songRaw = genData.song_recommendation || '';
    const [songPart, reasonPart] = songRaw.split(' — ');
    const dashIdx = songPart ? songPart.lastIndexOf(' - ') : -1;
    const songNameEl = document.getElementById('songName');
    const songArtistEl = document.getElementById('songArtist');
    const songReasonEl = document.getElementById('songReason');
    const whyTrigger = document.getElementById('whyTrigger');
    const whyTooltip = document.getElementById('whyTooltip');

    if (dashIdx !== -1) {
      songNameEl.textContent = songPart.substring(0, dashIdx).trim();
      songArtistEl.textContent = songPart.substring(dashIdx + 3).trim();
    } else {
      songNameEl.textContent = songRaw;
      songArtistEl.textContent = '';
    }
    songReasonEl.textContent = reasonPart || 'This song was chosen for its great match with your reel mood.';

    // Toggle the reason panel on click
    whyTrigger.addEventListener('click', () => {
      const isOpen = whyTooltip.classList.contains('open');
      whyTooltip.classList.toggle('open', !isOpen);
      whyTrigger.classList.toggle('active', !isOpen);
    });

    thumbResult.src = genData.image_url;
    aiOutputs.classList.remove('hidden');

    const assetKey = genData.presaige_asset_key;
    let progressLog = `[Step 1: AI Generated Reel Content]\n`;

    if (!assetKey) {
      showSuccess(`AI Reel Generated! (Presaige upload skipped or failed)`);
      resultJson.textContent = progressLog + `\n` + prettyPrintJson(genData);
      rawOutputDetails.classList.remove('hidden');
      return;
    }

    // === Step 2: Submit Presaige Score Job ===
    const jobEndpoint = `${proxyBase}/proxy/score`;
    resultStatus.textContent = `Submitting Presaige Score job for new thumbnail...`;

    const jobResponse = await fetch(jobEndpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ asset_key: assetKey, extended: true })
    });

    if (!jobResponse.ok) {
      let errBody = await jobResponse.text().catch(() => "");
      throw new Error(`Presaige Job submission failed: ${jobResponse.status} ${errBody}`);
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.job_id;
    const pollUrlPath = jobData.poll_url;

    progressLog += `\n[Step 2: Presaige Score Job Submitted] Job ID: ${jobId}\n`;
    resultJson.textContent = progressLog;

    if (!pollUrlPath) {
      showSuccess(`Score Job submitted but no poll_url returned.`);
      resultJson.textContent = progressLog + `\n` + prettyPrintJson(jobData);
      rawOutputDetails.classList.remove('hidden');
      return;
    }

    // === Step 3: Polling ===
    resultStatus.textContent = `Scoring Image...`;

    let proxyPollPath = pollUrlPath.startsWith('/') ? pollUrlPath.substring(1) : pollUrlPath;
    const pollEndpoint = `${proxyBase}/proxy/poll/${proxyPollPath}`;

    let isCompleted = false;
    let finalData = null;
    let attempts = 0;
    const maxAttempts = 40; // 80s max

    while (!isCompleted && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000));

      resultStatus.textContent = `Analyzing Thumbnail... (Attempt ${attempts})`;
      progressLog += `\n[Polling ${attempts}]... checking status...`;
      resultJson.textContent = progressLog;

      const pollResponse = await fetch(pollEndpoint, {
        method: 'GET',
        headers: { 'x-api-key': apiKey }
      });

      if (!pollResponse.ok) {
        throw new Error(`Polling failed: ${pollResponse.status}`);
      }

      finalData = await pollResponse.json();

      if (finalData.status === 'completed' || finalData.status === 'complete' || finalData.status === 'failed') {
        isCompleted = true;
        progressLog += ` ${finalData.status.toUpperCase()}!`;
      } else {
        progressLog += ` still ${finalData.status}`;
      }
      resultJson.textContent = progressLog;
    }

    rawOutputDetails.classList.remove('hidden');

    if (finalData && (finalData.status === 'completed' || finalData.status === 'complete')) {
      showSuccess(`Reel Successfully Optimized!`);
      renderBeautifiedResult(finalData);
      resultJson.textContent = progressLog + `\n\n--- RAW JSON RESULT ---\n` + prettyPrintJson(finalData);
    } else if (finalData && finalData.status === 'failed') {
      showError(`Score Job Failed.`);
      resultJson.textContent = progressLog + `\n\n--- FAILURE RESULT ---\n` + prettyPrintJson(finalData);
    } else {
      showError(`Scoring timed out after 80 seconds.`);
      resultJson.textContent = progressLog + `\n\n--- TIMEOUT DATA ---\n` + (finalData ? prettyPrintJson(finalData) : 'Timeout elapsed with no data.');
    }

  } catch (error) {
    console.error(error);
    showError(`Error: ${error.message}`);
    resultJson.textContent = `An error occurred while interacting with the API.\nIf this is a CORS error, you'll need the exact backend curl command and use a backend server to proxy the request.\n\nError Details:\n${error.toString()}`;
  } finally {
    setLoading(false);
    btnText.textContent = originalBtnText;
  }
}

// Attach the main flow to the test button
testBtn.addEventListener('click', runMainFlow);

// --- Auto Test removed, integrated above into runMainFlow ---

function setLoading(isLoading) {
  if (isLoading) {
    testBtn.disabled = true;
    testBtn.classList.remove('pulse-animation');
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');
    resultJson.textContent = 'Loading...';
  } else {
    testBtn.disabled = false;
    testBtn.classList.add('pulse-animation');
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
  }
}

function showError(msg) {
  resultStatus.textContent = msg;
  resultStatus.className = 'result-status status-error';
}

function showSuccess(msg) {
  resultStatus.textContent = msg;
  resultStatus.className = 'result-status status-success';
}

function renderBeautifiedResult(data) {
  beautifiedResult.innerHTML = '';

  if (data.scores) {
    beautifiedResult.classList.remove('hidden');

    // Create Score Cards
    const scoreGrid = document.createElement('div');
    scoreGrid.className = 'score-grid';

    const formattedNames = {
      wow_factor: 'Wow Factor',
      readiness_score: 'Readiness Score',
      elite_score: 'Elite Score',
      buzz_index: 'Buzz Index',
      elite_engagement_score: 'Engagement Score',
      benchmark_score: 'Benchmark Score',
      presaige_score: 'Presaige Score'
    };

    const sortedScores = Object.entries(data.scores).sort((a, b) => b[1] - a[1]);

    for (const [key, value] of sortedScores) {
      const card = document.createElement('div');
      card.className = 'score-card';

      const title = document.createElement('div');
      title.className = 'score-title';
      title.textContent = formattedNames[key] || key;

      const scoreValue = document.createElement('div');
      scoreValue.className = 'score-value';
      scoreValue.textContent = Number(value).toFixed(1) + '/10';

      const progressTrack = document.createElement('div');
      progressTrack.className = 'progress-track';

      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.style.width = `${(Number(value) / 10) * 100}%`;

      progressTrack.appendChild(progressBar);

      card.appendChild(title);
      card.appendChild(scoreValue);
      card.appendChild(progressTrack);

      scoreGrid.appendChild(card);
    }

    beautifiedResult.appendChild(scoreGrid);
  } else if (data.result && Array.isArray(data.result.Recreating)) {
    beautifiedResult.classList.remove('hidden');

    const recContainer = document.createElement('div');
    recContainer.className = 'recommendations-container';

    data.result.Recreating.forEach(rec => {
      const recCard = document.createElement('div');
      recCard.className = 'rec-card';

      recCard.innerHTML = `
              <h3 class="rec-header">${rec.HEADER}</h3>
              <p class="rec-desc"><strong>Approach:</strong> ${rec.APPROACH}</p>
              <p class="rec-desc"><strong>Technical Details:</strong> ${rec.TECHNICAL_DETAILS}</p>
              <p class="rec-desc"><strong>Benefits:</strong> ${rec.BENEFITS}</p>
          `;
      recContainer.appendChild(recCard);
    });
    beautifiedResult.appendChild(recContainer);
  }
}
