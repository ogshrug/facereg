document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('webcam');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const hiddenCanvas = document.getElementById('hidden-canvas');
    const hiddenCtx = hiddenCanvas.getContext('2d');

    const faceCountEl = document.getElementById('face-count');
    const avgConfidenceEl = document.getElementById('avg-confidence');
    const framesCountEl = document.getElementById('frames-count');
    const statusBadge = document.getElementById('status-badge');
    const toggleBtn = document.getElementById('toggle-btn');
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdValue = document.getElementById('threshold-value');
    const detectionLog = document.getElementById('detection-log');
    const permissionPrompt = document.getElementById('permission-prompt');
    const toast = document.getElementById('toast');

    let isPaused = false;
    let isProcessing = false;
    let framesProcessed = 0;
    let detectionInterval = null;
    let threshold = 0.5;
    const logEntries = [];

    // Initialize webcam
    async function initWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            permissionPrompt.classList.add('hidden');

            video.onloadedmetadata = () => {
                overlay.width = video.videoWidth;
                overlay.height = video.videoHeight;
                hiddenCanvas.width = video.videoWidth;
                hiddenCanvas.height = video.videoHeight;
                startDetectionLoop();
            };
        } catch (err) {
            console.error('Error accessing webcam:', err);
            permissionPrompt.classList.remove('hidden');
        }
    }

    function startDetectionLoop() {
        if (detectionInterval) clearInterval(detectionInterval);
        detectionInterval = setInterval(detectFaces, 300);
    }

    function stopDetectionLoop() {
        if (detectionInterval) {
            clearInterval(detectionInterval);
            detectionInterval = null;
        }
    }

    async function detectFaces() {
        if (isPaused || isProcessing) return;

        isProcessing = true;
        // Capture frame
        hiddenCtx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
        const base64Image = hiddenCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        try {
            const response = await fetch(`http://localhost:8000/detect?threshold=${threshold}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            });

            if (!response.ok) throw new Error('Backend response error');

            const data = await response.json();
            updateUI(data);
            toast.classList.add('hidden');
        } catch (err) {
            console.error('Detection error:', err);
            toast.classList.remove('hidden');
        } finally {
            isProcessing = false;
        }
    }

    function updateUI(data) {
        const { count, boxes } = data;

        // Update Face Count & Colors
        faceCountEl.textContent = count;
        faceCountEl.classList.remove('amber', 'red');
        if (count > 25) {
            faceCountEl.classList.add('red');
        } else if (count > 10) {
            faceCountEl.classList.add('amber');
        }

        // Draw Bounding Boxes
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#00ff88';
        ctx.font = '14px JetBrains Mono';

        let totalConfidence = 0;
        boxes.forEach(([x, y, w, h, conf]) => {
            ctx.strokeRect(x, y, w, h);
            const score = conf !== undefined ? conf.toFixed(2) : threshold.toFixed(2);
            ctx.fillText(score, x, y > 15 ? y - 5 : y + 15);
            totalConfidence += conf !== undefined ? conf : threshold;
        });

        // Update Avg Confidence
        const avgConf = count > 0 ? (totalConfidence / count).toFixed(2) : "0.00";
        avgConfidenceEl.textContent = avgConf;

        // Update Frames Processed
        framesProcessed++;
        framesCountEl.textContent = framesProcessed;

        // Update Log
        addToLog(count);
    }

    function addToLog(count) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        logEntries.unshift({ time: timeStr, count });
        if (logEntries.length > 10) logEntries.pop();

        renderLog();
    }

    function renderLog() {
        detectionLog.innerHTML = logEntries.map(entry => `
            <li>
                <span>${entry.time}</span>
                <span>${entry.count} faces</span>
            </li>
        `).join('');
    }

    // Event Listeners
    toggleBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            toggleBtn.textContent = 'Resume';
            statusBadge.textContent = 'Paused';
            statusBadge.classList.add('paused');
            stopDetectionLoop();
        } else {
            toggleBtn.textContent = 'Pause';
            statusBadge.textContent = 'Live';
            statusBadge.classList.remove('paused');
            startDetectionLoop();
        }
    });

    thresholdSlider.addEventListener('input', (e) => {
        threshold = parseFloat(e.target.value);
        thresholdValue.textContent = threshold.toFixed(1);
    });

    // Start everything
    initWebcam();
});
