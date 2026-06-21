// sidepanel.js — v6.0 with Brand Config + Distribution + Custom ImgBB Key

let isRunning = false;
let stopRequested = false;
let stats = { done: 0, errors: 0 };
let totalPosts = 30;
let allPostsData = [];

// ── Helper functions ──
function log(msg, type = 'info') {
  const scroll = document.getElementById('logScroll');
  if (!scroll) return;
  if (scroll.querySelector('.empty')) scroll.innerHTML = '';
  const t = new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="log-t">${t}</span>${msg}`;
  scroll.appendChild(line);
  scroll.scrollTop = scroll.scrollHeight;
}

// Web app mode - direct fetch to API endpoints
async function apiCall(endpoint, method = 'POST', data = {}) {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(data) : undefined
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('API call failed:', err);
    throw err;
  }
}

// NIM API call for content generation
async function callNIM(prompt, options = {}) {
  const nimEndpoint = options.endpoint || '/api/nim/generate';
  const apiKey = options.apiKey || '';
  
  try {
    const response = await fetch(nimEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        prompt,
        model: options.model || 'meta/llama-3.1-70b-instruct',
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 4096
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NIM API error: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    return result.choices?.[0]?.message?.content || result.output || '';
  } catch (err) {
    console.error('NIM API call failed:', err);
    throw err;
  }
}

function setProgress(msg, done, total) {
  const el = document.getElementById('progressStatus');
  const bar = document.getElementById('progressBar');
  const count = document.getElementById('progressCount');
  if (el) el.textContent = msg;
  if (bar) bar.style.width = (total > 0 ? Math.round((done / total) * 100) : 0) + '%';
  if (count) count.textContent = `${done}/${total}`;
  stats.done = done;
}

// ── Get brand settings ──
function getBrandSettings() {
  const enabled = document.getElementById('brandEnabled').checked;
  return {
    enabled: enabled,
    name: enabled ? document.getElementById('brandName').value.trim() : '',
    logoUrl: enabled && document.getElementById('logoEnabled').checked ? document.getElementById('logoUrl').value.trim() : '',
    includeLogo: enabled && document.getElementById('logoEnabled').checked
  };
}

// ── Get distribution settings ──
function getDistribution() {
  const useDistribution = document.getElementById('useDistribution').checked;
  
  if (!useDistribution) {
    const singleType = document.getElementById('singleTypeSelect').value;
    return { useDistribution: false, singleType, distribution: null };
  }
  
  const single = parseInt(document.getElementById('singlePercent').value) || 0;
  const carousel = parseInt(document.getElementById('carouselPercent').value) || 0;
  const story = parseInt(document.getElementById('storyPercent').value) || 0;
  const reel = parseInt(document.getElementById('reelPercent').value) || 0;
  
  return {
    useDistribution: true,
    distribution: { single, carousel, story, reel },
    total: single + carousel + story + reel
  };
}

function updatePercentSum() {
  const single = parseInt(document.getElementById('singlePercent').value) || 0;
  const carousel = parseInt(document.getElementById('carouselPercent').value) || 0;
  const story = parseInt(document.getElementById('storyPercent').value) || 0;
  const reel = parseInt(document.getElementById('reelPercent').value) || 0;
  const total = single + carousel + story + reel;
  const sumEl = document.getElementById('percentSum');
  const startBtn = document.getElementById('startBtn');
  
  if (total === 100) {
    sumEl.textContent = `Total: ${total}% ✓`;
    sumEl.className = 'percent-sum valid';
    if (startBtn) startBtn.disabled = false;
  } else {
    sumEl.textContent = `Total: ${total}% ✗ (must be 100%)`;
    sumEl.className = 'percent-sum invalid';
    if (startBtn) startBtn.disabled = true;
  }
  
  // Update preview text
  const preview = document.getElementById('typePreview');
  if (preview) {
    preview.innerHTML = `Single: ${single}% · Carousel: ${carousel}% · Story: ${story}% · Reel: ${reel}%`;
  }
  
  updateDayPreviewGrid();
}

function updateDayPreviewGrid() {
  const total = parseInt(document.getElementById('postCount').value) || 30;
  const useDist = document.getElementById('useDistribution').checked;
  const grid = document.getElementById('dayPreviewGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  if (!useDist) {
    const singleType = document.getElementById('singleTypeSelect').value;
    const typeShort = singleType === 'carousel' ? 'CAR' : (singleType === 'story' ? 'STY' : (singleType === 'reel-cover' ? 'REL' : 'SGL'));
    for (let i = 1; i <= Math.min(total, 30); i++) {
      const div = document.createElement('div');
      div.className = `day-preview ${singleType === 'carousel' ? 'carousel' : (singleType === 'story' ? 'story' : (singleType === 'reel-cover' ? 'reel' : 'single'))}`;
      div.textContent = i;
      if (i > total) div.style.opacity = '0.3';
      grid.appendChild(div);
    }
    return;
  }
  
  const single = parseInt(document.getElementById('singlePercent').value) || 0;
  const carousel = parseInt(document.getElementById('carouselPercent').value) || 0;
  const story = parseInt(document.getElementById('storyPercent').value) || 0;
  const reel = parseInt(document.getElementById('reelPercent').value) || 0;
  
  const singleCount = Math.round(total * single / 100);
  const carouselCount = Math.round(total * carousel / 100);
  const storyCount = Math.round(total * story / 100);
  let reelCount = total - singleCount - carouselCount - storyCount;
  if (reelCount < 0) reelCount = 0;
  
  let day = 1;
  for (let i = 0; i < singleCount && day <= total; i++) {
    const div = document.createElement('div');
    div.className = 'day-preview single';
    div.textContent = day++;
    grid.appendChild(div);
  }
  for (let i = 0; i < carouselCount && day <= total; i++) {
    const div = document.createElement('div');
    div.className = 'day-preview carousel';
    div.textContent = day++;
    grid.appendChild(div);
  }
  for (let i = 0; i < storyCount && day <= total; i++) {
    const div = document.createElement('div');
    div.className = 'day-preview story';
    div.textContent = day++;
    grid.appendChild(div);
  }
  for (let i = 0; i < reelCount && day <= total; i++) {
    const div = document.createElement('div');
    div.className = 'day-preview reel';
    div.textContent = day++;
    grid.appendChild(div);
  }
}

// ── Generate post types based on distribution ──
function generatePostTypes(total, distribution, singleType = null) {
  const types = [];
  
  if (!distribution) {
    // Single type only
    for (let i = 1; i <= total; i++) {
      types.push(singleType || 'single');
    }
    return types;
  }
  
  const singleCount = Math.round(total * distribution.single / 100);
  const carouselCount = Math.round(total * distribution.carousel / 100);
  const storyCount = Math.round(total * distribution.story / 100);
  let reelCount = total - singleCount - carouselCount - storyCount;
  if (reelCount < 0) reelCount = 0;
  
  // Build array
  for (let i = 0; i < singleCount; i++) types.push('single');
  for (let i = 0; i < carouselCount; i++) types.push('carousel');
  for (let i = 0; i < storyCount; i++) types.push('story');
  for (let i = 0; i < reelCount; i++) types.push('reel-cover');
  
  // Shuffle to mix types
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  
  return types;
}

// ── Build prompt with brand info ──
function buildPromptWithBrand(basePrompt, brandSettings, day, type) {
  if (!brandSettings.enabled) return basePrompt;
  
  let brandedPrompt = basePrompt;
  
  // Add brand signature instruction
  if (brandSettings.name) {
    brandedPrompt += `\n\nBRANDING REQUIREMENT: Include the brand signature "${brandSettings.name}" at the bottom of the design.`;
  }
  
  // Add logo instruction
  if (brandSettings.includeLogo && brandSettings.logoUrl) {
    brandedPrompt += `\n\nLOGO REQUIREMENT: Include the logo from ${brandSettings.logoUrl} placed in the ${type === 'story' || type === 'reel-cover' ? 'top-right' : 'bottom-right'} corner.`;
  }
  
  return brandedPrompt;
}

// ── Parse DeepSeek array response ──
function parseDeepSeekArray(raw) {
  let cleaned = raw
    .replace(/```json\s*([\s\S]*?)```/gi, '$1')
    .replace(/```[\s\S]*?```/gi, '$1')
    .trim();

  let fixed = '';
  let inStr = false, esc = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; fixed += c; continue; }
    if (c === '\\' && inStr) { esc = true; fixed += c; continue; }
    if (c === '"') { inStr = !inStr; fixed += c; continue; }
    if (inStr) {
      if (c === '\n') { fixed += '\\n'; continue; }
      if (c === '\r') { fixed += '\\r'; continue; }
      if (c === '\t') { fixed += '\\t'; continue; }
    }
    fixed += c;
  }
  cleaned = fixed;

  const start = cleaned.indexOf('[');
  if (start === -1) throw new Error('No JSON array found');
  let depth = 0, inStr2 = false, escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inStr2) { escape = true; continue; }
    if (c === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (c === '[') depth++;
    if (c === ']') {
      depth--;
      if (depth === 0) {
        const slice = cleaned.slice(start, i + 1).replace(/,\s*([\]}])/g, '$1');
        try { return JSON.parse(slice); }
        catch (e) { throw new Error('JSON parse failed: ' + e.message); }
      }
    }
  }
  throw new Error('Could not extract JSON array');
}

// ── Build NIM prompt ──
function buildNIMPrompt(brief, month, year, postTypes) {
  const typesInfo = postTypes.map((t, i) => `Day ${i + 1}: ${t}`).join(', ');
  return `You are an expert Instagram content strategist AND copywriter.
CONTENT BRIEF: ${brief}
MONTH: ${month} ${year}

CRITICAL: Output EXACTLY ${postTypes.length} post objects. No more, no less.

POST TYPES (must match exactly): ${typesInfo}

Every post must have: day (exact numbers), type, title, caption (150-300 chars with emojis), hashtags (15-20 array no #), image_prompt (detailed visual desc), hook, bullets (single only 3-item array), slides (carousel only: array of first/content/last each with title body image_prompt)

OUTPUT: JSON array only. No markdown. Start with [ end with ].`;
}

// ── Generate content ideas using NIM API ──
async function generateContentWithNIM(prompt, month, year, postTypes) {
  const BATCH_SIZE = 15;
  const total = postTypes.length;
  
  const buildBatchPrompt = (batchPosts, startDay) => {
    const batchTypes = batchPosts.map((p, i) => `Day ${startDay + i}: type ${p}`);
    return `You are an expert Instagram content strategist AND copywriter.
CONTENT BRIEF: ${prompt.split('CONTENT BRIEF: ')[1]?.split('\nMONTH:')[0] || prompt}
MONTH: ${month} ${year}

CRITICAL: Output EXACTLY ${batchPosts.length} post objects. No more, no less.

POST TYPES (must match exactly): ${batchTypes.join(', ')}

Every post must have: day (exact numbers), type, title, caption (150-300 chars with emojis), hashtags (15-20 array no #), image_prompt (detailed visual desc), hook, bullets (single only 3-item array), slides (carousel only: array of first/content/last each with title body image_prompt)

OUTPUT: JSON array only. No markdown. Start with [ end with ].`;
  };
  
  if (total <= BATCH_SIZE) {
    log(`→ NIM: generating ${total} posts...`, 'step');
    const raw = await callNIM(buildBatchPrompt(postTypes, 1));
    return parseDeepSeekArray(raw);
  }
  
  const allIdeas = [];
  let day = 1;
  let batchNum = 0;
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  
  while (day <= total) {
    if (stopRequested) break;
    const batchEnd = Math.min(day + BATCH_SIZE - 1, total);
    const batchPosts = postTypes.slice(day - 1, batchEnd);
    batchNum++;
    log(`→ Batch ${batchNum}/${totalBatches}: days ${day}–${day + batchPosts.length - 1}...`, 'step');
    setProgress(`Generating batch ${batchNum}/${totalBatches}...`, stats.done, total);
    
    const raw = await callNIM(buildBatchPrompt(batchPosts, day));
    const ideas = parseDeepSeekArray(raw);
    
    ideas.forEach((idea, idx) => { idea.day = day + idx; });
    log(`✓ Batch ${batchNum}: ${ideas.length} posts (days ${day}–${day + ideas.length - 1})`, 'success');
    allIdeas.push(...ideas);
    day += batchPosts.length;
    await new Promise(r => setTimeout(r, 500));
  }
  return allIdeas;
}

// ── Generate content ideas ──
async function generateContent(brief, month, year, postTypes) {
  const BATCH_SIZE = 15;
  const total = postTypes.length;
  
  const buildPrompt = (batchPosts, startDay) => {
    const batchTypes = batchPosts.map((p, i) => `Day ${startDay + i}: type ${p}`);
    return `You are an expert Instagram content strategist AND copywriter.
CONTENT BRIEF: ${brief}
MONTH: ${month} ${year}

CRITICAL: Output EXACTLY ${batchPosts.length} post objects. No more, no less.

POST TYPES (must match exactly): ${batchTypes.join(', ')}

Every post must have: day (exact numbers), type, title, caption (150-300 chars with emojis), hashtags (15-20 array no #), image_prompt (detailed visual desc), hook, bullets (single only 3-item array), slides (carousel only: array of first/content/last each with title body image_prompt)

OUTPUT: JSON array only. No markdown. Start with [ end with ].`;
  };
  
  if (total <= BATCH_SIZE) {
    log(`→ DeepSeek: generating ${total} posts...`, 'step');
    const raw = await exec('deepseek', 'prompt', { message: buildPrompt(postTypes, 1) });
    return parseDeepSeekArray(raw);
  }
  
  const allIdeas = [];
  let day = 1;
  let batchNum = 0;
  const totalBatches = Math.ceil(total / BATCH_SIZE);
  
  while (day <= total) {
    if (stopRequested) break;
    const batchEnd = Math.min(day + BATCH_SIZE - 1, total);
    const batchPosts = postTypes.slice(day - 1, batchEnd);
    batchNum++;
    log(`→ Batch ${batchNum}/${totalBatches}: days ${day}–${day + batchPosts.length - 1}...`, 'step');
    setProgress(`Generating batch ${batchNum}/${totalBatches}...`, stats.done, total);
    
    if (batchNum > 1) {
      await exec('deepseek', 'newchat', {});
      await new Promise(r => setTimeout(r, 2000));
    }
    
    const raw = await exec('deepseek', 'prompt', { message: buildPrompt(batchPosts, day) });
    const ideas = parseDeepSeekArray(raw);
    
    ideas.forEach((idea, idx) => { idea.day = day + idx; });
    log(`✓ Batch ${batchNum}: ${ideas.length} posts (days ${day}–${day + ideas.length - 1})`, 'success');
    allIdeas.push(...ideas);
    day += batchPosts.length;
    await new Promise(r => setTimeout(r, 1000));
  }
  return allIdeas;
}

// ── Save ImgBB key if provided ──
async function saveImgbbKey() {
  const useCustom = document.getElementById('useImgbbKey').checked;
  if (useCustom) {
    const key = document.getElementById('imgbbKey').value.trim();
    if (key) {
      // Store in localStorage for web app mode
      localStorage.setItem('userImgbbKey', key);
      log('✓ Custom ImgBB key saved', 'success');
    }
  } else {
    localStorage.removeItem('userImgbbKey');
  }
}

// ── DB operations via API ──
async function dbSavePlan(month, year, posts) {
  return await apiCall('/api/content/plans', 'POST', { month, year, posts });
}

async function dbLoadPlans() {
  return await apiCall('/api/content/plans', 'GET');
}

// ── Main generation workflow ──
async function startWorkflow() {
  const brief = document.getElementById('promptInput')?.value.trim();
  if (!brief) { alert('Please enter a content brief.'); return; }
  
  totalPosts = parseInt(document.getElementById('postCount')?.value) || 30;
  const month = document.getElementById('monthSelect')?.value || 'June';
  const year = document.getElementById('yearInput')?.value || '2026';
  
  // Get distribution
  const dist = getDistribution();
  let postTypes;
  
  if (!dist.useDistribution) {
    postTypes = Array(totalPosts).fill(dist.singleType);
    log(`📌 Using single type: ${dist.singleType} for all ${totalPosts} posts`, 'step');
  } else {
    if (dist.total !== 100) {
      alert(`Distribution total must be 100%. Currently: ${dist.total}%`);
      return;
    }
    postTypes = generatePostTypes(totalPosts, dist.distribution);
    log(`📊 Distribution: Single ${dist.distribution.single}%, Carousel ${dist.distribution.carousel}%, Story ${dist.distribution.story}%, Reel ${dist.distribution.reel}%`, 'step');
  }
  
  // Get brand settings
  const brandSettings = getBrandSettings();
  if (brandSettings.enabled) {
    log(`🏷️ Brand: "${brandSettings.name}" will be added to all images`, 'success');
    if (brandSettings.includeLogo && brandSettings.logoUrl) {
      log(`🖼️ Logo will be included from: ${brandSettings.logoUrl}`, 'success');
    }
  }
  
  // Save ImgBB key
  await saveImgbbKey();
  
  isRunning = true;
  stopRequested = false;
  stats = { done: 0, errors: 0 };
  allPostsData = [];

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.style.display = 'block';

  document.getElementById('progressCard').style.display = 'block';
  setProgress('Starting...', 0, totalPosts);
  log('🚀 Content Planner v6.0 — Generating with brand + distribution', 'success');

  try {
    setProgress('Connecting to NIM API...', 0, totalPosts);
    
    // Build prompt for NIM
    const nimPrompt = buildNIMPrompt(brief, month, year, postTypes);
    
    setProgress('Generating content ideas...', 0, totalPosts);
    log('→ Asking NIM for all posts...', 'step');

    const ideas = await generateContentWithNIM(nimPrompt, month, year, postTypes);
    log(`✓ Got ${ideas.length} ideas from NIM`, 'success');

    // Process and save each idea
    for (let i = 0; i < ideas.length && !stopRequested; i++) {
      const idea = ideas[i];
      const day = idea.day || (i + 1);
      const type = idea.type || postTypes[i] || 'single';

      setProgress(`Saving Day ${day}/${totalPosts}...`, stats.done, totalPosts);

      const record = {
        day,
        type,
        title: idea.title || '',
        hook: idea.hook || '',
        caption: idea.caption || '',
        hashtags: idea.hashtags || [],
        image_prompt: idea.image_prompt || '',
        bullets: idea.bullets || [],
        slides: (idea.slides || []).map(s => ({
          ...s,
          image_prompt: s.image_prompt || ''
        })),
        cta: idea.cta || '',
        tag: idea.tag || '',
        images: [],
        status: 'ideas_ready',
        brandSettings: brandSettings.enabled ? brandSettings : null
      };

      allPostsData.push(record);
      stats.done++;
      setProgress(`Day ${day} saved`, stats.done, totalPosts);
      log(`✓ Day ${day} (${type}): "${record.title.slice(0, 40)}"`, 'success');
    }

    // Save to DB via API
    if (allPostsData.length > 0) {
      log('→ Saving to database...', 'step');
      setProgress('Saving to database...', stats.done, totalPosts);
      await dbSavePlan(month, year, allPostsData);
      log(`✓ Saved ${allPostsData.length} posts to database`, 'success');
    }

    const msg = stopRequested
      ? `⏹ Stopped. ${stats.done}/${totalPosts} posts saved.`
      : `🎉 Done! ${stats.done} posts ready. Open Dashboard to generate images.`;
    log(msg, stopRequested ? 'warn' : 'success');
    setProgress(stopRequested ? 'Stopped' : '✓ Ideas ready — open Dashboard', stats.done, totalPosts);

  } catch (err) {
    log(`✗ Fatal: ${err.message}`, 'error');
    setProgress('Error — see log', stats.done, totalPosts);
  } finally {
    isRunning = false;
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

function stopWorkflow() {
  stopRequested = true;
  log('⏹ Stop requested...', 'warn');
}

async function openDashboard() {
  try {
    const plans = await dbLoadPlans();
    if (!plans || Object.keys(plans).length === 0) {
      alert('No plans found. Generate ideas first.');
      return;
    }
    // Web app mode - redirect to dashboard page
    window.location.href = 'dashboard.html';
  } catch (err) {
    log('Dashboard error: ' + err.message, 'error');
  }
}

async function openDesigner() {
  // Web app mode - redirect to designer page
  window.location.href = 'designer.html';
}

// ── Event listeners ──
document.addEventListener('DOMContentLoaded', () => {
  // Brand toggle
  document.getElementById('brandEnabled').addEventListener('change', (e) => {
    document.getElementById('brandFields').style.display = e.target.checked ? 'block' : 'none';
  });
  
  // Distribution toggle
  document.getElementById('useDistribution').addEventListener('change', (e) => {
    document.getElementById('distributionFields').style.display = e.target.checked ? 'block' : 'none';
    document.getElementById('singleTypeOnly').style.display = e.target.checked ? 'none' : 'block';
    updateDayPreviewGrid();
    if (!e.target.checked) {
      const singleType = document.getElementById('singleTypeSelect').value;
      document.getElementById('typePreview').innerHTML = `All posts: ${singleType}`;
    } else {
      updatePercentSum();
    }
  });
  
  // Sliders
  document.getElementById('singlePercent').addEventListener('input', (e) => {
    document.getElementById('singleVal').textContent = e.target.value + '%';
    updatePercentSum();
  });
  document.getElementById('carouselPercent').addEventListener('input', (e) => {
    document.getElementById('carouselVal').textContent = e.target.value + '%';
    updatePercentSum();
  });
  document.getElementById('storyPercent').addEventListener('input', (e) => {
    document.getElementById('storyVal').textContent = e.target.value + '%';
    updatePercentSum();
  });
  document.getElementById('reelPercent').addEventListener('input', (e) => {
    document.getElementById('reelVal').textContent = e.target.value + '%';
    updatePercentSum();
  });
  
  // Post count change
  document.getElementById('postCount').addEventListener('input', () => updateDayPreviewGrid());
  document.getElementById('singleTypeSelect').addEventListener('change', () => updateDayPreviewGrid());
  
  // ImgBB key toggle
  document.getElementById('useImgbbKey').addEventListener('change', (e) => {
    document.getElementById('imgbbKeyField').style.display = e.target.checked ? 'block' : 'none';
  });
  
  // Buttons
  document.getElementById('startBtn').addEventListener('click', startWorkflow);
  document.getElementById('stopBtn').addEventListener('click', stopWorkflow);
  document.getElementById('dashBtn').addEventListener('click', openDashboard);
  document.getElementById('openDesignerBtn').addEventListener('click', openDesigner);
  
  // Initial state
  document.getElementById('brandFields').style.display = 'none';
  document.getElementById('distributionFields').style.display = 'block';
  document.getElementById('singleTypeOnly').style.display = 'none';
  document.getElementById('imgbbKeyField').style.display = 'none';
  updatePercentSum();
});