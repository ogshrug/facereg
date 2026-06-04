document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('webcam');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const hiddenCanvas = document.getElementById('hidden-canvas');
    const hiddenCtx = hiddenCanvas.getContext('2d');

    const faceCountEl = document.getElementById('face-count');
    const targetCountEl = document.getElementById('target-count');
    const avgConfidenceEl = document.getElementById('avg-confidence');
    const framesCountEl = document.getElementById('frames-count');
    const statusBadge = document.getElementById('status-badge');
    const toggleBtn = document.getElementById('toggle-btn');
    const showBoxesToggle = document.getElementById('show-boxes-toggle');
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdValue = document.getElementById('threshold-value');
    const simThresholdSlider = document.getElementById('sim-threshold-slider');
    const simThresholdValue = document.getElementById('sim-threshold-value');
    const targetMatchesBody = document.getElementById('target-matches-body');
    const detectionLog = document.getElementById('detection-log');
    const permissionPrompt = document.getElementById('permission-prompt');
    const toast = document.getElementById('toast');

    // Target Management Elements
    const dropZone = document.getElementById('drop-zone');
    const targetUploadInput = document.getElementById('target-upload-input');
    const uploadBtnTrigger = document.getElementById('upload-btn-trigger');
    const targetGallery = document.getElementById('target-gallery');

    let isPaused = false;
    let isProcessing = false;
    let framesProcessed = 0;
    let detectionInterval = null;
    let threshold = 0.5;
    let simThreshold = 0.6;
    const logEntries = [];
    let targets = [];

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
            const response = await fetch(`http://localhost:8000/detect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    threshold: threshold,
                    similarity_threshold: simThreshold
                })
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
        const { count, faces } = data;

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

        let totalConfidence = 0;
        let targetMatches = [];

        faces.forEach(face => {
            const [x, y, w, h] = face.box;
            const conf = face.confidence;
            const match = face.match;

            if (showBoxesToggle.checked) {
                if (match) {
                    ctx.strokeStyle = '#ff4d4d'; // Red for targets
                    ctx.fillStyle = '#ff4d4d';
                } else {
                    ctx.strokeStyle = '#00ff88'; // Green for normal
                    ctx.fillStyle = '#00ff88';
                }

                ctx.lineWidth = 2;
                ctx.font = '14px JetBrains Mono';
                ctx.strokeRect(x, y, w, h);

                const label = match ? `${match.name} (${match.similarity})` : conf.toFixed(2);
                ctx.fillText(label, x, y > 15 ? y - 5 : y + 15);
            }

            totalConfidence += conf;
            if (match) {
                targetMatches.push(match);
            }
        });

        // Update Target Count
        targetCountEl.textContent = targetMatches.length;

        // Update Target Matches Table
        targetMatchesBody.innerHTML = targetMatches.map(m => `
            <tr>
                <td>${escapeHtml(m.name)}</td>
                <td>${m.similarity}</td>
            </tr>
        `).join('');

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

    simThresholdSlider.addEventListener('input', (e) => {
        simThreshold = parseFloat(e.target.value);
        simThresholdValue.textContent = simThreshold.toFixed(2);
    });

    // --- Target Management Logic ---

    async function loadTargets() {
        try {
            const response = await fetch('http://localhost:8000/targets');
            targets = await response.json();
            renderTargetGallery();
        } catch (err) {
            console.error('Error loading targets:', err);
        }
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    function renderTargetGallery() {
        targetGallery.innerHTML = targets.map(target => {
            const safeName = escapeHtml(target.name);
            return `
                <div class="target-item" title="${safeName}">
                    <img src="http://localhost:8000/targets/${target.id}/image" alt="${safeName}">
                    <button class="delete-btn" data-id="${target.id}">&times;</button>
                </div>
            `;
        }).join('');

        // Add delete listeners
        targetGallery.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                deleteTarget(e.target.dataset.id);
            });
        });
    }

    async function deleteTarget(id) {
        if (!confirm('Delete this target?')) return;
        try {
            const response = await fetch(`http://localhost:8000/targets/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                targets = targets.filter(t => t.id !== id);
                renderTargetGallery();
            }
        } catch (err) {
            console.error('Error deleting target:', err);
        }
    }

    async function uploadTarget(file) {
        const name = prompt('Enter a name for this person:', file.name.split('.')[0]) || 'Unknown';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);

        try {
            const response = await fetch('http://localhost:8000/targets', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert(`Upload failed: ${errorData.detail || 'Unknown error'}`);
                return;
            }

            loadTargets();
        } catch (err) {
            console.error('Error uploading target:', err);
            alert('Upload failed. Check console for details.');
        }
    }

    // Upload Event Listeners
    uploadBtnTrigger.addEventListener('click', () => targetUploadInput.click());

    targetUploadInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadTarget(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            uploadTarget(e.dataTransfer.files[0]);
        }
    });

    // Start everything
    loadTargets();
    initWebcam();
});
