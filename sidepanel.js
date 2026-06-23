// sidepanel.js — v6.4 (streaming chat via /api/chat proxy, dropdown model selector + F4 debug panel)
//
// Changes from v6.3:
//   - Replaced F4 modal with dropdown model selector in HTML
//   - Added F4 debug panel showing logs: prompt sent, token count, errors, final output, parsing errors
//   - Model selection via dropdown persists to localStorage
//   - Chat panel streams through /api/chat with detailed logging

let isRunning    = false;
let stopRequested = false;
let stats        = { done:0, errors:0 };
let totalPosts   = 2;
let allPostsData = [];

// Available models (same list as /api/chat.js)
const AVAILABLE_MODELS = [
  'moonshotai/kimi-k2.6',
  'nvidia/llama-3.1-nemoguard-8b-content-safety',
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'mistralai/mistral-large-3-675b-instruct-2512',
];

// Get/set current model from localStorage and dropdown
function getCurrentModel() {
  const dropdown = document.getElementById('modelSelect');
  if (dropdown && dropdown.value) {
    return dropdown.value;
  }
  return localStorage.getItem('selectedModel') || AVAILABLE_MODELS[3]; // default to deepseek-v4-pro
}
function setCurrentModel(model) {
  if (AVAILABLE_MODELS.includes(model)) {
    localStorage.setItem('selectedModel', model);
    const dropdown = document.getElementById('modelSelect');
    if (dropdown) dropdown.value = model;
  }
}

// Debug logging for F4 panel
function debugLog(msg, type='info') {
  const panel = document.getElementById('debugPanel');
  const logs = document.getElementById('debugLogs');
  if (!logs) return;
  
  const t = new Date().toLocaleTimeString('en',{ hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const line = document.createElement('div');
  line.style.marginBottom = '6px';
  
  let color = 'var(--muted2)';
  if (type === 'prompt') color = 'var(--accent2)';
  else if (type === 'tokens') color = 'var(--accent)';
  else if (type === 'error') color = 'var(--error)';
  else if (type === 'success') color = 'var(--success)';
  else if (type === 'parse') color = 'var(--warn)';
  
  line.innerHTML = `<span style="color:${color};">[${t}] ${msg}</span>`;
  logs.appendChild(line);
  logs.scrollTop = logs.scrollHeight;
}

function clearDebugLogs() {
  const logs = document.getElementById('debugLogs');
  if (logs) logs.innerHTML = '';
}

const MONTH_NAMES_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── Helpers ───────────────────────────────────────────────────────────
function daysInSelectedMonth() {
  const monthName = document.getElementById('monthSelect')?.value || 'January';
  const year      = parseInt(document.getElementById('yearInput')?.value) || new Date().getFullYear();
  const idx       = MONTH_NAMES_FULL.indexOf(monthName);
  if (idx === -1) return 2;
  return new Date(year, idx + 1, 0).getDate();
}

function lockPostCountToMonth() {
  const input = document.getElementById('postCount');
  if (input) input.value = 2;
  totalPosts = 2;
  updateDayPreviewGrid();
}

function log(msg, type='info') {
  const scroll = document.getElementById('logScroll');
  if (!scroll) return;
  if (scroll.querySelector('.empty')) scroll.innerHTML = '';
  const t = new Date().toLocaleTimeString('en',{ hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const line  = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="log-t">${t}</span>${msg}`;
  scroll.appendChild(line);
  scroll.scrollTop = scroll.scrollHeight;
}

// ── API helpers ───────────────────────────────────────────────────────
async function apiCall(endpoint, method='POST', data={}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout
  
  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out after 60 seconds');
    }
    throw err;
  }
}

// All NIM calls go through the server-side proxy to avoid CORS pre-flight
async function callNIM(prompt, options={}) {
  debugLog(`⏳ Starting API call to /api/content/generate...`, 'info');
  const startTime = Date.now();
  
  try {
    const result = await apiCall('/api/content/generate', 'POST', {
      prompt,
      model:       options.model       || getCurrentModel(),
      temperature: options.temperature || 0.7,
      max_tokens:  options.max_tokens  || 4096,
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    debugLog(`✅ API response received in ${elapsed}s`, 'success');
    
    if (result?.error) {
      debugLog(`❌ API returned error: ${result.error}`, 'error');
      throw new Error(result.error);
    }
    
    const tokenCount = result?.content?.length || 0;
    debugLog(`📊 Response size: ${tokenCount} chars`, 'tokens');
    
    return result?.content || '';
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    debugLog(`❌ API call failed after ${elapsed}s: ${err.message}`, 'error');
    throw err;
  }
}

// ── Progress ──────────────────────────────────────────────────────────
function setProgress(msg, done, total) {
  const el    = document.getElementById('progressStatus');
  const bar   = document.getElementById('progressBar');
  const count = document.getElementById('progressCount');
  const dayEl = document.getElementById('dayStatus');
  if (el)    el.textContent    = msg;
  if (bar)   bar.style.width   = (total>0 ? Math.round((done/total)*100) : 0) + '%';
  if (count) count.textContent = `${done}/${total}`;
  if (dayEl) dayEl.textContent = `Current: Day ${done + 1} of ${total}`;
  stats.done = done;
}

// ── Brand settings ────────────────────────────────────────────────────
function getBrandSettings() {
  const enabled = document.getElementById('brandEnabled').checked;
  return {
    enabled,
    name:        enabled ? document.getElementById('brandName').value.trim() : '',
    logoUrl:     enabled && document.getElementById('logoEnabled').checked
                   ? document.getElementById('logoUrl').value.trim() : '',
    includeLogo: enabled && document.getElementById('logoEnabled').checked,
  };
}

// ── Distribution settings ─────────────────────────────────────────────
function getDistribution() {
  const useDistribution = document.getElementById('useDistribution').checked;
  if (!useDistribution) {
    return { useDistribution:false, singleType: document.getElementById('singleTypeSelect').value, distribution:null };
  }
  const single   = parseInt(document.getElementById('singlePercent').value)   || 0;
  const carousel = parseInt(document.getElementById('carouselPercent').value) || 0;
  const story    = parseInt(document.getElementById('storyPercent').value)    || 0;
  const reel     = parseInt(document.getElementById('reelPercent').value)     || 0;
  return { useDistribution:true, distribution:{ single, carousel, story, reel }, total: single+carousel+story+reel };
}

function updatePercentSum() {
  const single   = parseInt(document.getElementById('singlePercent').value)   || 0;
  const carousel = parseInt(document.getElementById('carouselPercent').value) || 0;
  const story    = parseInt(document.getElementById('storyPercent').value)    || 0;
  const reel     = parseInt(document.getElementById('reelPercent').value)     || 0;
  const total    = single + carousel + story + reel;
  const sumEl    = document.getElementById('percentSum');
  const startBtn = document.getElementById('startBtn');
  if (total === 100) {
    sumEl.textContent = `Total: ${total}% ✓`; sumEl.className = 'percent-sum valid';
    if (startBtn) startBtn.disabled = false;
  } else {
    sumEl.textContent = `Total: ${total}% ✗ (must be 100%)`; sumEl.className = 'percent-sum invalid';
    if (startBtn) startBtn.disabled = true;
  }
  const preview = document.getElementById('typePreview');
  if (preview) preview.innerHTML = `Single: ${single}% · Carousel: ${carousel}% · Story: ${story}% · Reel: ${reel}%`;
  updateDayPreviewGrid();
}

function updateDayPreviewGrid() {
  const total    = 2; // hardcoded to 2 days
  const useDist  = document.getElementById('useDistribution').checked;
  const grid     = document.getElementById('dayPreviewGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!useDist) {
    const singleType = document.getElementById('singleTypeSelect').value;
    for (let i=1; i<=total; i++) {
      const div = document.createElement('div');
      div.className = `day-preview ${singleType==='carousel'?'carousel':(singleType==='story'?'story':(singleType==='reel-cover'?'reel':'single'))}`;
      div.textContent = i;
      grid.appendChild(div);
    }
    return;
  }
  const single   = parseInt(document.getElementById('singlePercent').value)   || 0;
  const carousel = parseInt(document.getElementById('carouselPercent').value) || 0;
  const story    = parseInt(document.getElementById('storyPercent').value)    || 0;
  const sC = Math.round(total*single/100);
  const cC = Math.round(total*carousel/100);
  const stC= Math.round(total*story/100);
  let   rC = Math.max(0, total - sC - cC - stC);
  let day = 1;
  const addCells = (n, cls) => { for(let i=0;i<n&&day<=total;i++){ const d=document.createElement('div'); d.className=`day-preview ${cls}`; d.textContent=day++; grid.appendChild(d); }};
  addCells(sC,'single'); addCells(cC,'carousel'); addCells(stC,'story'); addCells(rC,'reel');
}

// ── Post type generator ───────────────────────────────────────────────
function generatePostTypes(total, distribution, singleType=null) {
  if (!distribution) return Array(total).fill(singleType || 'single');
  const sC = Math.round(total*distribution.single/100);
  const cC = Math.round(total*distribution.carousel/100);
  const stC= Math.round(total*distribution.story/100);
  let   rC = Math.max(0, total - sC - cC - stC);
  const types = [
    ...Array(sC).fill('single'), ...Array(cC).fill('carousel'),
    ...Array(stC).fill('story'), ...Array(rC).fill('reel-cover'),
  ];
  for (let i=types.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types;
}

// ── Parse JSON array from DeepSeek ───────────────────────────────────
function parseDeepSeekArray(raw) {
  let cleaned = raw
    .replace(/```json\s*([\s\S]*?)```/gi,'$1')
    .replace(/```[\s\S]*?```/gi,'$1')
    .trim();

  // Fix unescaped newlines inside strings
  let fixed='', inStr=false, esc=false;
  for (let i=0; i<cleaned.length; i++) {
    const c = cleaned[i];
    if (esc)         { esc=false; fixed+=c; continue; }
    if (c==='\\'&&inStr) { esc=true; fixed+=c; continue; }
    if (c==='"')     { inStr=!inStr; fixed+=c; continue; }
    if (inStr) {
      if (c==='\n')  { fixed+='\\n'; continue; }
      if (c==='\r')  { fixed+='\\r'; continue; }
      if (c==='\t')  { fixed+='\\t'; continue; }
    }
    fixed += c;
  }
  cleaned = fixed;

  const start = cleaned.indexOf('[');
  if (start===-1) throw new Error('No JSON array found');
  let depth=0, inStr2=false, escape=false;
  for (let i=start; i<cleaned.length; i++) {
    const c=cleaned[i];
    if (escape) { escape=false; continue; }
    if (c==='\\'&&inStr2) { escape=true; continue; }
    if (c==='"') { inStr2=!inStr2; continue; }
    if (inStr2) continue;
    if (c==='[') depth++;
    if (c===']') {
      depth--;
      if (depth===0) {
        const slice = cleaned.slice(start,i+1).replace(/,\s*([\]}])/g,'$1');
        try { return JSON.parse(slice); } catch(e) { throw new Error('JSON parse failed: '+e.message); }
      }
    }
  }
  throw new Error('Could not extract JSON array');
}

// ── Content generation ────────────────────────────────────────────────
// New flow: Generate one day at a time instead of batches

async function generateContentWithNIM(brief, month, year, postTypes) {
  const total = postTypes.length;
  const allIdeas = [];

  const buildDayPrompt = (postType, dayNum) => {
    return `You are an expert Instagram content strategist AND copywriter.
CONTENT BRIEF: ${brief}
MONTH: ${month} ${year}
DAY: ${dayNum}
POST TYPE: ${postType}

CRITICAL: Output EXACTLY 1 post object for Day ${dayNum}.

Every post must have: day (exact number ${dayNum}), type (${postType}), title, caption (150-300 chars with emojis), hashtags (15-20 array no # prefix), image_prompt (detailed visual desc), hook, bullets (single only 3-item array), audience (one of: client, student), platforms (array, any of: ig, yt, li), slides (carousel only: array of first/content/last each with title body image_prompt)

OUTPUT: JSON object only (no array wrapper). No markdown. Start with { end with }.`;
  };

  // Parse single object response (for day-by-day generation)
  const parseSingleObject = (raw) => {
    debugLog(`📥 Raw API response (${raw.length} chars): ${raw.slice(0, 200)}...`, 'response');
    
    // Check for common error patterns first
    if (raw.toLowerCase().includes('error:') || raw.toLowerCase().includes('api key') || raw.toLowerCase().includes('rate limit')) {
      debugLog(`⚠️ Response contains error keywords`, 'error');
      throw new Error('API returned error: ' + raw.slice(0, 150));
    }
    
    let cleaned = raw
      .replace(/```json\s*([\s\S]*?)```/gi,'$1')
      .replace(/```\s*([\s\S]*?)```/gi,'$1')
      .trim();
    
    debugLog(`🧹 After markdown cleanup (${cleaned.length} chars): ${cleaned.slice(0, 200)}...`, 'response');
    
    // Fix unescaped newlines inside strings
    let fixed='', inStr=false, esc=false;
    for (let i=0; i<cleaned.length; i++) {
      const c = cleaned[i];
      if (esc)         { esc=false; fixed+=c; continue; }
      if (c==='\\'&&inStr) { esc=true; fixed+=c; continue; }
      if (c==='"')     { inStr=!inStr; fixed+=c; continue; }
      if (inStr) {
        if (c==='\n')  { fixed+='\\n'; continue; }
        if (c==='\r')  { fixed+='\\r'; continue; }
        if (c==='\t')  { fixed+='\\t'; continue; }
      }
      fixed += c;
    }
    cleaned = fixed;
    
    debugLog(`🔧 After newline escaping (${cleaned.length} chars): ${cleaned.slice(0, 200)}...`, 'response');
    
    const start = cleaned.indexOf('{');
    if (start===-1) {
      debugLog(`❌ No '{' found in response. First 300 chars: ${cleaned.slice(0, 300)}`, 'error');
      throw new Error('No JSON object found - response may be empty or malformed');
    }
    
    debugLog(`✅ Found '{' at position ${start}`, 'response');
    
    let depth=0, inStr2=false, escape=false;
    for (let i=start; i<cleaned.length; i++) {
      const c=cleaned[i];
      if (escape) { escape=false; continue; }
      if (c==='\\'&&inStr2) { escape=true; continue; }
      if (c==='"') { inStr2=!inStr2; continue; }
      if (inStr2) continue;
      if (c==='{') depth++;
      if (c==='}') {
        depth--;
        if (depth===0) {
          const slice = cleaned.slice(start,i+1);
          debugLog(`📦 Extracted JSON (${slice.length} chars): ${slice.slice(0, 150)}...`, 'response');
          try { return JSON.parse(slice); } catch(e) { 
            debugLog(`❌ JSON parse error: ${e.message}`, 'error');
            throw new Error('JSON parse failed: '+e.message); 
          }
        }
      }
    }
    debugLog(`❌ Could not find matching '}' for JSON object`, 'error');
    throw new Error('Could not extract JSON object - incomplete response');
  };

  log(`→ Starting day-by-day generation for ${total} days…`, 'step');

  for (let day = 1; day <= total; day++) {
    if (stopRequested) break;
    
    const postType = postTypes[day - 1];
    log(`→ Generating Day ${day}/${total} (${postType})…`, 'step');
    setProgress(`Generating Day ${day}/${total}…`, stats.done, total);

    try {
      const raw = await callNIM(buildDayPrompt(postType, day), { model: getCurrentModel(), max_tokens:4096 });
      debugLog(`📡 Sending request with model: ${getCurrentModel()}`, 'prompt');
      const idea = parseSingleObject(raw);
      idea.day = day;
      idea.type = postType;
      
      log(`✓ Day ${day} complete: "${idea.title?.slice(0,40) || 'Untitled'}"`, 'success');
      allIdeas.push(idea);
      stats.done = day;
      setProgress(`Day ${day} complete`, stats.done, total);
      
      // Update AI stream box with current day output (append mode for accumulation)
      if (window.appendAIStream) {
        const dayOutput = `=== DAY ${day} (${postType}) ===\n${JSON.stringify(idea, null, 2)}`;
        window.appendAIStream(dayOutput);
      } else if (window.updateAIStream) {
        window.updateAIStream(JSON.stringify(idea, null, 2), false);
      }
      
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      log(`✗ Day ${day} failed: ${err.message}`, 'error');
      debugLog(`❌ Day ${day} error details:`, 'error');
      debugLog(`   - Error name: ${err.name}`, 'error');
      debugLog(`   - Error message: ${err.message}`, 'error');
      debugLog(`   - Stack: ${err.stack || 'N/A'}`, 'error');
      // Continue to next day instead of stopping
      stats.errors++;
      // Update progress to show we're moving past this day
      setProgress(`Day ${day} failed, continuing...`, stats.done, total);
    }
  }
  
  return allIdeas;
}

async function dbSavePlan(month, year, posts) {
  return await apiCall('/api/content/plans', 'POST', { month, year, posts });
}
async function dbLoadPlans() {
  return await apiCall('/api/content/plans', 'GET');
}

// ── Main generation workflow ──────────────────────────────────────────
async function startWorkflow() {
  const brief = document.getElementById('promptInput')?.value.trim();
  if (!brief) { alert('Please enter a content brief.'); return; }

  totalPosts  = 2; // hardcoded to 2 days
  const month = document.getElementById('monthSelect')?.value || 'June';
  const year  = document.getElementById('yearInput')?.value  || '2026';
  const dist  = getDistribution();
  let postTypes;

  if (!dist.useDistribution) {
    postTypes = Array(totalPosts).fill(dist.singleType);
    log(`📌 Using single type: ${dist.singleType} for all ${totalPosts} posts`, 'step');
  } else {
    if (dist.total !== 100) { alert(`Distribution total must be 100%. Currently: ${dist.total}%`); return; }
    postTypes = generatePostTypes(totalPosts, dist.distribution);
    log(`📊 Distribution: Single ${dist.distribution.single}%, Carousel ${dist.distribution.carousel}%, Story ${dist.distribution.story}%, Reel ${dist.distribution.reel}%`, 'step');
  }

  const brandSettings = getBrandSettings();
  if (brandSettings.enabled) {
    log(`🏷️ Brand: "${brandSettings.name}" will be added to all images`, 'success');
    if (brandSettings.includeLogo && brandSettings.logoUrl) {
      log(`🖼️ Logo will be included from: ${brandSettings.logoUrl}`, 'success');
    }
  }

  // ImgBB key
  if (document.getElementById('useImgbbKey').checked) {
    const key = document.getElementById('imgbbKey').value.trim();
    if (key) { localStorage.setItem('userImgbbKey', key); log('✓ Custom ImgBB key saved', 'success'); }
  } else { localStorage.removeItem('userImgbbKey'); }

  isRunning  = true; stopRequested = false; stats = { done:0, errors:0 }; allPostsData = [];

  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').style.display = 'block';
  document.getElementById('progressCard').style.display = 'block';
  setProgress('Starting…', 0, totalPosts);
  log('🚀 Content Planner — Generating 2 days (test mode)', 'success');

  try {
    setProgress('Generating content ideas day-by-day…', 0, totalPosts);
    log('→ Starting day-by-day generation with DeepSeek…', 'step');
    
    // Clear AI stream box at start
    if (window.updateAIStream) {
      window.updateAIStream('', true);
    }

    const ideas = await generateContentWithNIM(brief, month, year, postTypes);
    log(`✓ Generated ${ideas.length} days of content`, 'success');

    // Build records from generated ideas
    for (let i=0; i<ideas.length && !stopRequested; i++) {
      const idea = ideas[i];
      const day  = idea.day || (i+1);
      const type = idea.type || postTypes[i] || 'single';
      
      const record = {
        day, type,
        title:        idea.title        || '',
        hook:         idea.hook         || '',
        caption:      idea.caption      || '',
        hashtags:     idea.hashtags     || [],
        image_prompt: idea.image_prompt || '',
        bullets:      idea.bullets      || [],
        audience:     idea.audience     || '',
        platforms:    idea.platforms    || [],
        slides: (Array.isArray(idea.slides) ? idea.slides : Object.values(idea.slides || {})).map(s => ({ ...s, image_prompt: s.image_prompt || '' })),
        cta:          idea.cta          || '',
        tag:          idea.tag          || '',
        images:       [],
        status:       'ideas_ready',
        brandSettings: brandSettings.enabled ? brandSettings : null,
      };
      allPostsData.push(record);
    }

    if (allPostsData.length > 0) {
      log('→ Saving complete plan to database…', 'step');
      setProgress('Saving to database…', allPostsData.length, totalPosts);
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
    debugLog(`❌ FATAL ERROR: ${err.message}`, 'error');
    setProgress('Error — see log', stats.done, totalPosts);
  } finally {
    isRunning = false;
    if (window.updateAIStream) {
      window.updateAIStream('', false);
    }
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').style.display = 'none';
  }
}

function stopWorkflow() { stopRequested = true; log('⏹ Stop requested…', 'warn'); }

async function openDashboard() {
  try {
    const plans = await dbLoadPlans();
    if (!plans || Object.keys(plans).length === 0) { alert('No plans found. Generate ideas first.'); return; }
    window.location.href = 'studio.html?tab=dashboard';
  } catch (err) { log('Dashboard error: ' + err.message, 'error'); }
}
function openDesigner() { window.location.href = 'studio.html?tab=designer'; }

// ════════════════════════════════════════════════════════════════
// STREAMING CHAT PANEL
// ════════════════════════════════════════════════════════════════
//
// Calls /api/chat (Railway proxy) with stream:true and renders
// tokens in real-time with a blinking cursor.
// Falls back to /api/content/generate (non-streaming) if the
// streaming path fails (e.g. server doesn't pipe SSE).

const chatHistory = []; // { role, content }[]

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Inject chat styles (once)
function injectChatStyles() {
  if (document.getElementById('spChatStyles')) return;
  const style = document.createElement('style');
  style.id = 'spChatStyles';
  style.textContent = `
    .sp-chat-wrap { display:flex; flex-direction:column; gap:0; height:100%; }
    .sp-chat-msgs {
      flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px;
      padding:10px; background:var(--s2); border-radius:8px 8px 0 0;
      min-height:180px; max-height:260px;
    }
    .sp-msg { max-width:90%; padding:7px 10px; border-radius:10px;
      font-size:11px; line-height:1.55; word-wrap:break-word; }
    .sp-msg.user { align-self:flex-end; background:var(--accent2); color:#fff;
      border-bottom-right-radius:3px; }
    .sp-msg.bot  { align-self:flex-start; background:var(--s3); color:var(--text);
      border-bottom-left-radius:3px; font-family:var(--mono); white-space:pre-wrap; }
    .sp-msg.system { align-self:center; color:var(--muted); font-size:10px;
      font-style:italic; background:transparent; }
    .sp-cursor { display:inline-block; width:2px; height:1em; background:var(--accent);
      margin-left:1px; vertical-align:text-bottom; animation:spBlink 0.7s infinite; }
    @keyframes spBlink { 0%,100%{opacity:1} 50%{opacity:0} }
    .sp-input-row { display:flex; gap:6px; background:var(--s3);
      border:1px solid var(--border2); border-top:none;
      border-radius:0 0 8px 8px; padding:7px; }
    .sp-input-row textarea {
      flex:1; resize:none; min-height:34px; max-height:80px;
      background:var(--s2); border:1px solid var(--border);
      color:var(--text); border-radius:5px; padding:6px 8px;
      font-family:var(--sans); font-size:12px; line-height:1.4; outline:none;
    }
    .sp-input-row textarea:focus { border-color:var(--accent2); }
    .sp-send { background:var(--accent); border:none; color:#000;
      border-radius:5px; padding:0 13px; font-family:var(--mono);
      font-size:10px; font-weight:700; cursor:pointer; white-space:nowrap; }
    .sp-send:disabled { opacity:0.4; cursor:not-allowed; }
    .sp-chat-status { font-family:var(--mono); font-size:9px; color:var(--muted);
      padding:3px 0 0 2px; min-height:14px; }
    .sp-token-bar { font-family:var(--mono); font-size:9px; color:var(--accent2);
      padding:2px 10px; background:rgba(77,159,255,0.06);
      border-left:2px solid var(--accent2); margin:2px 0 0; border-radius:0 3px 3px 0;
      display:none; }
  `;
  document.head.appendChild(style);
}

function buildChatSection() {
  injectChatStyles();

  // Target the #chatContainer div instead of searching for sections
  const container = document.getElementById('chatContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="sp-chat-wrap">
      <div class="sp-chat-msgs" id="spMsgs">
        <div class="sp-msg system">AI output will appear here during generation...</div>
      </div>

      <div class="sp-token-bar" id="spTokenBar">● streaming…</div>

      <div class="sp-input-row">
        <textarea id="spInput" placeholder="Type your question… (Enter to send, Shift+Enter for newline)" rows="2"></textarea>
        <button class="sp-send" id="spSend">SEND</button>
      </div>
    </div>
    <div class="sp-chat-status" id="spStatus">idle · DeepSeek v4 Pro</div>
  `;

  wireChat();
}

function wireChat() {
  const input   = document.getElementById('spInput');
  const sendBtn = document.getElementById('spSend');
  if (!input || !sendBtn) return;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
  });
  sendBtn.addEventListener('click', async () => {
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    input.style.height = 'auto';
    await sendChatMessage(msg);
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(80, input.scrollHeight) + 'px';
  });
}

function appendMsg(role, text='') {
  const msgs = document.getElementById('spMsgs');
  if (!msgs) return null;
  const el = document.createElement('div');
  el.className = `sp-msg ${role}`;
  if (text) el.textContent = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

function setStatus(text, color='') {
  const el = document.getElementById('spStatus');
  if (!el) return;
  el.textContent  = text;
  el.style.color  = color || '';
}

function setTokenBar(visible, text='') {
  const el = document.getElementById('spTokenBar');
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
  if (text) el.textContent = text;
}

async function sendChatMessage(userMsg) {
  const sendBtn = document.getElementById('spSend');
  const input   = document.getElementById('spInput');
  if (sendBtn) sendBtn.disabled = true;
  if (input)   input.disabled   = true;

  appendMsg('user', userMsg);
  chatHistory.push({ role:'user', content: userMsg });

  // Log prompt sent
  debugLog(`📤 PROMPT SENT: "${userMsg.substring(0, 80)}${userMsg.length > 80 ? '...' : ''}"`, 'prompt');
  debugLog(`📎 Model: ${getCurrentModel()}`, 'info');

  const botEl = appendMsg('bot');
  if (!botEl) { if(sendBtn) sendBtn.disabled=false; if(input) input.disabled=false; return; }

  // Show cursor while streaming
  const cursor = document.createElement('span');
  cursor.className = 'sp-cursor';
  botEl.appendChild(cursor);

  setStatus('connecting…', 'var(--accent2)');
  setTokenBar(true, '● connecting…');

  let fullContent = '';
  let tokenCount  = 0;
  let streamOk    = false;

  try {
    // ── Try streaming via /api/chat ──────────────────────────────
    const currentModel = getCurrentModel();
    const response = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory,
        model:    currentModel,
        stream:   true,
        temperature: 0.7,
        max_tokens:  2048,
      }),
    });

    if (response.ok && response.body) {
      streamOk = true;
      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream:true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          
          let data = trimmedLine.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          
          data = data.replace(/^```json\s*/, '').replace(/```\s*$/, '');
          
          try {
            const parsed = JSON.parse(data);
            const token  = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              fullContent += token;
              tokenCount++;
              botEl.textContent = fullContent;
              botEl.appendChild(cursor);
              document.getElementById('spMsgs').scrollTop = 9999;
              setTokenBar(true, `● ${tokenCount} tokens · streaming…`);
              setStatus(`streaming · ${tokenCount} tokens`, 'var(--accent2)');
            }
          } catch (parseErr) {
            const braceStart = data.indexOf('{');
            const braceEnd = data.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd > braceStart) {
              try {
                const extracted = data.slice(braceStart, braceEnd + 1);
                const parsed = JSON.parse(extracted);
                const token  = parsed.choices?.[0]?.delta?.content || '';
                if (token) {
                  fullContent += token;
                  tokenCount++;
                  botEl.textContent = fullContent;
                  botEl.appendChild(cursor);
                  document.getElementById('spMsgs').scrollTop = 9999;
                  setTokenBar(true, `● ${tokenCount} tokens · streaming…`);
                  setStatus(`streaming · ${tokenCount} tokens`, 'var(--accent2)');
                }
              } catch (_) { /* skip malformed */ }
            }
          }
        }
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }

  } catch (streamErr) {
    // ── Fallback: non-streaming via /api/content/generate ────────
    console.warn('[Chat] Streaming failed, falling back to non-streaming:', streamErr.message);
    debugLog(`⚠️ Streaming error: ${streamErr.message}`, 'error');
    setStatus('streaming unavailable — fetching full response…', 'var(--warn)');
    setTokenBar(true, '● fetching (non-streaming)…');

    try {
      const result = await apiCall('/api/content/generate', 'POST', {
        prompt: chatHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
          + '\n\nAssistant:',
        model:       getCurrentModel(),
        temperature: 0.7,
        max_tokens:  2048,
      });
      fullContent = result?.content || '(no response)';
      botEl.textContent = fullContent;
      botEl.appendChild(cursor);
    } catch (fallbackErr) {
      fullContent = `Error: ${fallbackErr.message}`;
      botEl.textContent = fullContent;
      cursor.remove();
      setStatus('error · ' + fallbackErr.message, 'var(--error)');
      setTokenBar(false);
      chatHistory.push({ role:'assistant', content: fullContent });
      debugLog(`❌ ERROR: ${fallbackErr.message}`, 'error');
      if (sendBtn) sendBtn.disabled = false;
      if (input)   input.disabled   = false;
      return;
    }
  }

  // ── Done ─────────────────────────────────────────────────────────
  cursor.remove();
  chatHistory.push({ role:'assistant', content: fullContent });

  if (tokenCount > 0) {
    debugLog(`✅ FINAL OUTPUT RECEIVED: ${tokenCount} tokens`, 'success');
    debugLog(`📊 TOKEN COUNT: ${tokenCount}`, 'tokens');
    setStatus(`done · ${tokenCount} tokens · ${getCurrentModel().split('/').pop()}`, 'var(--accent)');
  } else {
    debugLog(`✅ FINAL OUTPUT RECEIVED (no token count)`, 'success');
    setStatus('done · ' + getCurrentModel().split('/').pop(), 'var(--accent)');
  }
  setTokenBar(false);

  if (sendBtn) sendBtn.disabled = false;
  if (input) {
    input.disabled = false;
    input.focus();
  }
}

// ── Event listeners ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('brandEnabled').addEventListener('change', e => {
    document.getElementById('brandFields').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('useDistribution').addEventListener('change', e => {
    document.getElementById('distributionFields').style.display = e.target.checked ? 'block' : 'none';
    document.getElementById('singleTypeOnly').style.display     = e.target.checked ? 'none' : 'block';
    updateDayPreviewGrid();
    if (!e.target.checked) {
      document.getElementById('typePreview').innerHTML = `All posts: ${document.getElementById('singleTypeSelect').value}`;
    } else { updatePercentSum(); }
  });

  ['singlePercent','carouselPercent','storyPercent','reelPercent'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      document.getElementById(id.replace('Percent','Val')).textContent = e.target.value + '%';
      updatePercentSum();
    });
  });

  document.getElementById('monthSelect').addEventListener('change', lockPostCountToMonth);
  document.getElementById('yearInput').addEventListener('input',  lockPostCountToMonth);
  document.getElementById('postCount').addEventListener('input',  () => updateDayPreviewGrid());
  document.getElementById('singleTypeSelect').addEventListener('change', () => updateDayPreviewGrid());
  document.getElementById('useImgbbKey').addEventListener('change', e => {
    document.getElementById('imgbbKeyField').style.display = e.target.checked ? 'block' : 'none';
  });

  document.getElementById('startBtn').addEventListener('click', startWorkflow);
  document.getElementById('stopBtn').addEventListener('click',  stopWorkflow);
  document.getElementById('dashBtn').addEventListener('click',  openDashboard);
  document.getElementById('openDesignerBtn').addEventListener('click', openDesigner);

  // AI Stream Response Box functionality
  const clearStreamBtn = document.getElementById('clearStreamBtn');
  const copyStreamBtn = document.getElementById('copyStreamBtn');
  const aiStreamContent = document.getElementById('aiStreamContent');
  const streamStatusDot = document.getElementById('streamStatusDot');

  if (clearStreamBtn) {
    clearStreamBtn.addEventListener('click', () => {
      if (aiStreamContent) aiStreamContent.textContent = '';
      if (streamStatusDot) streamStatusDot.classList.remove('streaming');
    });
  }

  if (copyStreamBtn) {
    copyStreamBtn.addEventListener('click', async () => {
      if (aiStreamContent && aiStreamContent.textContent) {
        try {
          await navigator.clipboard.writeText(aiStreamContent.textContent);
          copyStreamBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyStreamBtn.textContent = '📋 Copy'; }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }
    });
  }

  window.updateAIStream = function(content, isStreaming = false) {
    if (aiStreamContent) aiStreamContent.textContent = content;
    if (streamStatusDot) {
      if (isStreaming) streamStatusDot.classList.add('streaming');
      else streamStatusDot.classList.remove('streaming');
    }
  };
  
  window.appendAIStream = function(content) {
    if (aiStreamContent) {
      const current = aiStreamContent.textContent || '';
      if (current.length > 0) {
        aiStreamContent.textContent = current + '\n\n---\n\n' + content;
      } else {
        aiStreamContent.textContent = content;
      }
      aiStreamContent.scrollTop = aiStreamContent.scrollHeight;
    }
  };

  // Init UI state
  document.getElementById('brandFields').style.display      = 'none';
  document.getElementById('distributionFields').style.display= 'block';
  document.getElementById('singleTypeOnly').style.display    = 'none';
  document.getElementById('imgbbKeyField').style.display     = 'none';
  lockPostCountToMonth();
  updatePercentSum();
});

// ── Model Selector Modal Functions ────────────────────────────────────
function showModelModal() {
  const modal = document.getElementById('modelModal');
  const modelList = document.getElementById('modelList');
  if (!modal || !modelList) return;
  
  const currentModel = getCurrentModel();
  modelList.innerHTML = AVAILABLE_MODELS.map(model => {
    const isCurrent = model === currentModel;
    const shortName = model.split('/').pop();
    return `
      <button class="model-option" data-model="${model}" style="
        background: ${isCurrent ? 'rgba(77,255,160,0.15)' : 'var(--s3)'};
        border: ${isCurrent ? '1px solid var(--accent)' : '1px solid var(--border)'};
        color: ${isCurrent ? 'var(--accent)' : 'var(--text)'};
        padding: 12px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-family: var(--mono);
        font-size: 11px;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 8px;
      " onmouseover="this.style.background='${isCurrent ? 'rgba(77,255,160,0.15)' : 'var(--s2)'}'" onmouseout="this.style.background='${isCurrent ? 'rgba(77,255,160,0.15)' : 'var(--s3)'}'">
        <span style="font-size:14px;">${isCurrent ? '✅' : '⚪'}</span>
        <div>
          <div style="font-weight:700;">${shortName}</div>
          <div style="font-size:9px;color:var(--muted2);">${model}</div>
        </div>
      </button>
    `;
  }).join('');
  
  modelList.querySelectorAll('.model-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedModel = btn.dataset.model;
      setCurrentModel(selectedModel);
      closeModal();
    });
  });
  
  updateCurrentModelLabel();
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('modelModal');
  if (modal) modal.style.display = 'none';
}

function updateCurrentModelLabel() {
  const label = document.getElementById('currentModelLabel');
  if (label) {
    const current = getCurrentModel();
    const shortName = current.split('/').pop();
    label.textContent = `Current: ${shortName} (${current})`;
  }
}

document.getElementById('closeModelModal')?.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'F4') {
    e.preventDefault();
    showModelModal();
  }
  if (e.key === 'Escape') {
    closeModal();
  }
});

updateCurrentModelLabel();
