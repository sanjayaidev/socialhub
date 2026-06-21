// ai-designs.js - Gallery for AI-generated images

let currentPlanId = null;
let allImages = [];
let currentRegenerateId = null;

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 2500);
}

function dbMsg(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.success) return reject(new Error(res?.error || 'DB error'));
      resolve(res.result);
    });
  });
}

async function loadPlans() {
  const plans = await dbMsg('dbLoadPlans');
  const sel = document.getElementById('planSelect');
  sel.innerHTML = '<option value="">-- All Plans --</option>' + 
    Object.entries(plans).map(([k, p]) => `<option value="${k}">${p.month} ${p.year}</option>`).join('');
  sel.addEventListener('change', () => loadImages(sel.value));
  if (Object.keys(plans).length > 0) {
    sel.value = Object.keys(plans)[0];
    await loadImages(sel.value);
  } else {
    document.getElementById('gallery').innerHTML = '<div class="empty-state">No plans found. Generate AI images from Dashboard first.</div>';
  }
}

async function loadImages(planId) {
  currentPlanId = planId;
  document.getElementById('gallery').innerHTML = '<div class="empty-state">Loading...</div>';
  
  try {
    allImages = await dbMsg('dbLoadAIImages', { planId });
    renderGallery();
    document.getElementById('stats').textContent = `${allImages.length} images`;
  } catch (err) {
    document.getElementById('gallery').innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
  }
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  if (!allImages.length) {
    gallery.innerHTML = '<div class="empty-state">No AI-generated images yet. Enable AI Mode in Dashboard and generate images.</div>';
    return;
  }
  
  gallery.innerHTML = allImages.map(img => `
    <div class="image-card" data-id="${img.id}">
      <div class="image-preview">
        <img src="${img.imageUrl}" alt="Day ${img.day} Slide ${img.slideIndex + 1}" loading="lazy">
      </div>
      <div class="card-info">
        <div class="card-day">DAY ${img.day} ${img.type === 'carousel' ? `· Slide ${img.slideIndex + 1}` : ''}</div>
        <div class="card-prompt" title="Click to view full prompt">${img.prompt.slice(0, 120)}${img.prompt.length > 120 ? '...' : ''}</div>
        <div class="card-actions">
          <button class="btn" data-action="regenerate" data-id="${img.id}">↻ Regenerate</button>
          <button class="btn" data-action="download" data-id="${img.id}">↓ Download</button>
          <button class="btn btn-danger" data-action="delete" data-id="${img.id}">🗑 Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  
  // Attach event listeners
  document.querySelectorAll('[data-action="regenerate"]').forEach(btn => {
    btn.addEventListener('click', () => openRegenerateModal(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="download"]').forEach(btn => {
    btn.addEventListener('click', () => downloadImage(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteImage(btn.dataset.id));
  });
}

function openRegenerateModal(id) {
  const image = allImages.find(i => i.id == id);
  if (!image) return;
  currentRegenerateId = id;
  document.getElementById('regeneratePromptInput').value = image.prompt;
  document.getElementById('regenerateModal').classList.add('open');
}

async function regenerateImage() {
  const newPrompt = document.getElementById('regeneratePromptInput').value;
  if (!newPrompt) return;
  
  const image = allImages.find(i => i.id == currentRegenerateId);
  if (!image) return;
  
  document.getElementById('regenerateModal').classList.remove('open');
  toast('Generating new image...', 'success');
  
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'generateAIImage',
        prompt: newPrompt,
        aspectRatio: image.aspectRatio || '1:1',
        day: image.day,
        slideIndex: image.slideIndex,
        type: image.type,
        planId: currentPlanId,
        replaceId: currentRegenerateId
      }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        if (!res?.success) reject(new Error(res?.error || 'Generation failed'));
        resolve(res.result);
      });
    });
    
    toast('Image regenerated successfully!');
    await loadImages(currentPlanId);
  } catch (err) {
    toast(`Failed: ${err.message}`, 'error');
  }
}

async function downloadImage(id) {
  const image = allImages.find(i => i.id == id);
  if (!image || !image.imageUrl) return;
  
  const a = document.createElement('a');
  a.href = image.imageUrl;
  a.download = `ai_day${image.day}_${image.type}${image.slideIndex !== undefined ? `_s${image.slideIndex + 1}` : ''}.png`;
  a.click();
  toast('Download started');
}

async function deleteImage(id) {
  if (!confirm('Delete this AI-generated image?')) return;
  await dbMsg('dbDeleteAIImage', { id });
  toast('Image deleted');
  await loadImages(currentPlanId);
}

// Close modal handlers
document.getElementById('regenerateModalClose').addEventListener('click', () => {
  document.getElementById('regenerateModal').classList.remove('open');
});
document.getElementById('regenerateModalCancel').addEventListener('click', () => {
  document.getElementById('regenerateModal').classList.remove('open');
});
document.getElementById('regenerateModalConfirm').addEventListener('click', regenerateImage);
document.getElementById('refreshBtn').addEventListener('click', () => loadImages(currentPlanId));
document.getElementById('backToDashboardBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

// Close modal on overlay click
document.getElementById('regenerateModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('regenerateModal')) {
    document.getElementById('regenerateModal').classList.remove('open');
  }
});

loadPlans();