document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const targetUploadInput = document.getElementById('target-upload-input');
    const uploadBtnTrigger = document.getElementById('upload-btn-trigger');
    const targetGallery = document.getElementById('target-gallery');

    let targets = [];

    async function loadTargets() {
        try {
            const response = await fetch(`${API_URL}/targets`);
            targets = await response.json();
            renderTargetGallery();
        } catch (err) {
            console.error('Error loading targets:', err);
        }
    }

    function renderTargetGallery() {
        targetGallery.innerHTML = targets.map(target => {
            const safeName = escapeHtml(target.name);
            return `
                <div class="target-item" title="${safeName}">
                    <img src="${API_URL}/targets/${target.id}/image" alt="${safeName}">
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
            const response = await fetch(`${API_URL}/targets/${id}`, {
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
            const response = await fetch(`${API_URL}/targets`, {
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
    if (uploadBtnTrigger) {
        uploadBtnTrigger.addEventListener('click', () => targetUploadInput.click());
    }

    if (targetUploadInput) {
        targetUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uploadTarget(e.target.files[0]);
            }
        });
    }

    if (dropZone) {
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
    }

    loadTargets();
});
