const tabs = document.querySelectorAll('.tab');
const testBtn = document.getElementById('testBtn');
const btnText = document.querySelector('.btn-text');
const loader = document.querySelector('.loader');
const dropZone = document.getElementById('dropZone');
const mediaInput = document.getElementById('mediaInput');
const uploadContent = document.querySelector('.upload-content');
const previewImage = document.getElementById('previewImage');
const previewVideo = document.getElementById('previewVideo');
const resultJson = document.getElementById('resultJson');
const beautifiedResult = document.getElementById('beautifiedResult');
const resultStatus = document.querySelector('.result-status');

// API Base URL (Point to our new local proxy server)
const API_BASE = 'http://localhost:3000/api/proxy';

let currentMode = 'score'; // 'score' or 'recommendations'
let selectedFile = null;

// Tab Switching logic
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.tab;

    // Update Button Text
    btnText.textContent = `Test ${currentMode === 'score' ? 'Score' : 'Recommendations'} API`;

    // Suggest default endpoint in placeholder
    document.getElementById('endpointUrl').placeholder = `${API_BASE} (Leave blank for default)`;
  });
});

// Drag & Drop logic
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => mediaInput.click());
mediaInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

function handleFiles(files) {
  if (files.length === 0) return;
  selectedFile = files[0];

  const fileUrl = URL.createObjectURL(selectedFile);

  uploadContent.classList.add('hidden');

  if (selectedFile.type.startsWith('video/')) {
    previewImage.classList.add('hidden');
    previewVideo.src = fileUrl;
    previewVideo.classList.remove('hidden');
  } else {
    previewVideo.classList.add('hidden');
    previewImage.src = fileUrl;
    previewImage.classList.remove('hidden');
  }
}

// Ensure the json string is pretty printed
function prettyPrintJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// Main Test Function
async function runMainFlow() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const customBase = document.getElementById('endpointUrl').value.trim();
  const apiBase = customBase || API_BASE;
  const originalBtnText = btnText.textContent;

  if (!apiKey) {
    showError("Please enter your Presaige API Key.");
    return;
  }

  if (!selectedFile) {
    try {
      resultStatus.textContent = "Auto-loading test_image.jpg for demo...";
      const response = await fetch('/test_image.jpg');
      const blob = await response.blob();
      selectedFile = new File([blob], "test_image.jpg", { type: "image/jpeg" });
      handleFiles([selectedFile]);
    } catch (err) {
      console.error("Auto-load failed", err);
      showError("Please select an image or video file.");
      return;
    }
  }

  // Update UI to loading
  setLoading(true);

  try {
    beautifiedResult.classList.add('hidden');
    resultJson.classList.remove('hidden');

    // === Step 1: Request Upload URL ===
    resultStatus.textContent = `Requesting pre-signed upload URL from ${apiBase}/upload...`;
    resultStatus.className = 'result-status';
    resultJson.textContent = 'Starting process...';

    const uploadResponse = await fetch(`${apiBase}/upload`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: selectedFile.name,
        content_type: selectedFile.type
      })
    });

    if (!uploadResponse.ok) {
      let errBody = await uploadResponse.text().catch(() => "");
      throw new Error(`Failed to get upload URL: ${uploadResponse.status} ${errBody}`);
    }

    const uploadData = await uploadResponse.json();
    const assetKey = uploadData.asset_key;
    const uploadUrl = uploadData.upload_url;

    if (!assetKey || !uploadUrl) {
      throw new Error("API succeeded but did not return 'asset_key' or 'upload_url'.");
    }

    let progressLog = `[Step 1: Upload URL Generated] Asset Key: ${assetKey}\n`;
    resultJson.textContent = progressLog;

    // === Step 2: PUT file to S3/CloudFront ===
    resultStatus.textContent = `Uploading actual file to CloudFront/S3...`;
    progressLog += `[Step 2: Uploading File] Uploading...`;
    resultJson.textContent = progressLog;

    const s3Response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": selectedFile.type
      },
      body: selectedFile // Send the raw file blob
    });

    if (!s3Response.ok) {
      let errBody = await s3Response.text().catch(() => "");
      throw new Error(`S3/CloudFront PUT Upload failed: ${s3Response.status} ${errBody}`);
    }

    progressLog += ` Success!\n`;
    resultJson.textContent = progressLog;

    // === Step 3: Submit Job ===
    const jobEndpoint = `${apiBase}/${currentMode}`;
    resultStatus.textContent = `Submitting ${currentMode} job...`;

    const jobPayload = currentMode === 'score'
      ? { asset_key: assetKey, extended: true }
      : { asset_key: assetKey };

    const jobResponse = await fetch(jobEndpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(jobPayload)
    });

    if (!jobResponse.ok) {
      let errBody = await jobResponse.text().catch(() => "");
      throw new Error(`Job submission failed: ${jobResponse.status} ${jobResponse.statusText} ${errBody}`);
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.job_id;
    const pollUrlPath = jobData.poll_url;

    progressLog += `\n[Step 3: Job Submitted] Job ID: ${jobId}, Status: ${jobData.status}\n`;
    resultJson.textContent = progressLog;

    if (!pollUrlPath) {
      showSuccess(`Job submitted but no poll_url returned. Final response below.`);
      resultJson.textContent = progressLog + `\n` + prettyPrintJson(jobData);
      return;
    }

    // === Step 4: Polling ===
    resultStatus.textContent = `Polling for results...`;

    // Construct valid poll URL to hit our proxy system
    // The Presaige API either returns a full url like https://api... or a relative path /score/xxx
    // We pass that downstream path/URL to our proxy under /api/proxy/poll/<rest-of-url>
    let proxyPollPath = pollUrlPath.startsWith('/') ? pollUrlPath.substring(1) : pollUrlPath;
    const pollEndpoint = `${apiBase}/poll/${proxyPollPath}`;

    let isCompleted = false;
    let finalData = null;
    let attempts = 0;
    const maxAttempts = 40; // max wait: 40 * 2s = 80s

    while (!isCompleted && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds

      resultStatus.textContent = `Polling for results... (Attempt ${attempts})`;
      progressLog += `\n[Polling Attempt ${attempts}]... checking status...`;
      resultJson.textContent = progressLog;

      const pollResponse = await fetch(pollEndpoint, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey
        }
      });

      if (!pollResponse.ok) {
        throw new Error(`Polling failed: ${pollResponse.status} ${pollResponse.statusText}`);
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

    if (finalData && (finalData.status === 'completed' || finalData.status === 'complete')) {
      showSuccess(`Job ${finalData.status} successfully!`);
      renderBeautifiedResult(finalData);
      resultJson.textContent = progressLog + `\n\n--- RAW JSON RESULT ---\n` + prettyPrintJson(finalData);
    } else if (finalData && finalData.status === 'failed') {
      showError(`Job Failed.`);
      resultJson.textContent = progressLog + `\n\n--- FAILURE RESULT ---\n` + prettyPrintJson(finalData);
    } else {
      showError(`Polling timed out after 80 seconds.`);
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
