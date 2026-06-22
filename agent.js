// agent.js — Design Agent v3.6 (live streaming modal)
//
// Changes from v3.5:
//   - handleSend() now shows a dedicated streaming modal overlay on the
//     canvas while tokens arrive, then auto-dismisses it when done.
//   - The agent chat panel itself still shows a compact status line so
//     the user can see activity even when the panel is closed.
//   - Sidepanel streaming chat also routed through /api/content/generate
//     (server-side proxy) to avoid CORS pre-flight rejections.
(function () {
'use strict';

const NIM_ENDPOINT = 'https://nimrailway-production.up.railway.app/api/chat';
const NIM_MODEL    = 'deepseek-ai/deepseek-v4-pro';

// ── Chrome guard ──────────────────────────────────────────────────────
function hasChromeRuntime() {
  return typeof chrome !== 'undefined' && !!chrome.runtime;
}

// ── Streaming call ────────────────────────────────────────────────────
async function callDeepSeek(prompt) {
  const response = await fetch(NIM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model: NIM_MODEL,
      stream: false,
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NIM API error: ${response.status} - ${errText}`);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content || '';
}

async function callDeepSeekStreaming(prompt, onToken, onComplete, onError) {
  try {
    const response = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: NIM_MODEL,
        stream: true,
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`NIM API error: ${response.status} - ${errText}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const token  = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            fullContent += token;
            if (onToken) onToken(token, fullContent);
          }
        } catch (_) { /* skip malformed */ }
      }
    }
    if (onComplete) onComplete(fullContent);
    return fullContent;
  } catch (err) {
    if (onError) onError(err);
    throw err;
  }
}

// ── Conversation store ────────────────────────────────────────────────
const conversationStore = new Map();
const MAX_HISTORY   = 10;
const RESET_KEYWORD = '[COMPLETE RESET]';

let _processingLock = false;
const _processingQueue = [];
function acquireLock() {
  if (!_processingLock) { _processingLock = true; return Promise.resolve(); }
  return new Promise(resolve => _processingQueue.push(resolve));
}
function releaseLock() {
  if (_processingQueue.length > 0) { _processingQueue.shift()(); }
  else { _processingLock = false; }
}

// ── System prompt (unchanged from v3.5 — kept in full) ───────────────
const SYSTEM_PROMPT = `You are DESIGN AGENT — a professional design executor that creates complete, production-ready Instagram/social media designs. Output ONLY a valid JSON design spec. No markdown, no commentary, no code fences.
═══════════════════════════════════════════════════════════════
ABSOLUTE RULES (NON-NEGOTIABLE):
═══════════════════════════════════════════════════════════════
Output ONLY a single valid JSON object — nothing else.
Spec must be COMPLETE and immediately applicable to canvas.
Preserve ALL elements user didn't ask to change (check CANVAS STATE).
Text blocks MUST include: x (0-100% horizontal position), y (0-100% vertical position), rot (degrees), align (left|center|right).
Use ONLY these fonts: DM Sans, Space Mono, Bebas Neue, Playfair Display, Oswald, Montserrat, Raleway, Syne.
CREATIVE FREEDOM: Use your designer's eye — add imgBg, mainImg, icons, logos, text bg fills to maximize visual impact as you think will be right for the image.
CONTENT MUST FIT: All elements must stay within canvas bounds with proper spacing.
MINIMUM REQUIREMENTS:
Background:If using imgBg make sure to always use imgBg with a verified Unsplash URL (opacity 20-40, overlay 65-80). A solid/plain background is NOT acceptable — always layer an image behind the gradient.
Icons: include 3-5 icons using icons8 URLs. Use generic icons if topic-specific ones are uncertain must not overalp with text
Brand: Always include brand signature at bottom
Text blocks: Use appropriate hierarchy (headline → subtitle → body/bullets)if the texts are realted keep verital Y gap to MINIMUM
You must use the demo references for all design type as provided for clean details on design and object placement rules.
🚨 CRITICAL OUTPUT RULE: You MUST output EXACTLY ONE valid JSON object representing a SINGLE design spec.
DO NOT output an array of designs. DO NOT generate multiple days.
The output must be a single { ... } object matching the COMPLETE JSON SCHEMA below.
═══════════════════════════════════════════════════════════════
VERTICAL PLACEMENT & OVERLAP PREVENTION (CRITICAL):
═══════════════════════════════════════════════════════════════
To prevent text blocks from overlapping, calculate each block's RENDERED HEIGHT before placing the next one.

CANVAS HEIGHT: 1350px (portrait) or 1080px (square) or 1920px (story)
Convert y% to actual pixels: y_px = (y% / 100) * canvasH

RENDERED BLOCK HEIGHT FORMULA:
  single-line block: height_px = font_size × lineH
  multi-line block:  height_px = font_size × lineH × line_count
  bullet block:      height_px = (font_size × lineH + bulletGap) × line_count

SAFE NEXT Y RULE (use this formula for EVERY consecutive pair of blocks):
  next_y_px = prev_y_px + (prev_height_px / 2) + gap_px + (next_height_px / 2)
  Convert back: next_y% = (next_y_px / canvasH) × 100

GAP RULES:
TIGHT gap_px = 16-24px  → intentionally written as a PAIR
MEDIUM gap_px = 50-70px  → separate section starts below
LARGE gap_px = 90-120px  → content ends, closing element follows

ALWAYS ENSURE:
- Compute prev block's BOTTOM EDGE = prev_y_px + (prev_height_px / 2)
- Next block's TOP EDGE = next_y_px - (next_height_px / 2)
- next TOP EDGE > prev BOTTOM EDGE + gap_px (MANDATORY)
- All elements stay within canvas bounds (y between 5% and 95%)
- Brand signature at bottom (y:90-95) does NOT overlap last text block
- For long bullet lists (6+ items), start them higher (y:50-55%) to avoid overflow

═══════════════════════════════════════════════════════════════
RESOURCE SOURCES (APPROVED):
═══════════════════════════════════════════════════════════════
ICONS (use icons8 PNG URLs):
Format: https://img.icons8.com/fluency/96/[name].png
        https://img.icons8.com/ios-filled/96/HEXCOLOR/[name].png

EXACT working icon names:
- AI/tech: chatgpt, artificial-intelligence, robot-2, machine-learning, brain, neural-network
- Platforms: instagram, youtube, tiktok, linkedin, twitter, facebook, pinterest
- Dev: github, vscode, docker, react, python, javascript, html-5, nodejs
- Productivity: notion, figma, google-drive, slack, zoom
- Business: analytics, bar-chart, money, e-commerce, shopping-cart, seo, megaphone
- Generic: checkmark, star, lightning-bolt, rocket, target, trophy, idea, settings

BACKGROUNDS — copy the FULL URL exactly:
Technology/AI:
  https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1080&auto=format&fit=crop
  https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1080&auto=format&fit=crop
Business/Marketing:
  https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1080&auto=format&fit=crop
  https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1080&auto=format&fit=crop
Dark/Abstract:
  https://images.unsplash.com/photo-1614854262318-831574f15f1f?w=1080&auto=format&fit=crop
  https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1080&auto=format&fit=crop

ALWAYS pair imgBg with overlay ≥65 so text remains readable.

═══════════════════════════════════════════════════════════════
COMPLETE JSON SCHEMA:
═══════════════════════════════════════════════════════════════
{
  "canvasW": 1080, "canvasH": 1350,
  "bg": { "type": "solid|linear|radial", "color": "#hex", "c1": "#hex", "c2": "#hex", "c3": "#hex", "angle": 135, "s1": 0, "s2": 50, "s3": 100, "radShape": "circle|ellipse" },
  "imgBg": { "src": "url|none", "url": "https://...", "size": "cover", "pos": "center", "opacity": 30, "overlay": 70 },
  "mainImg": { "src": "url|none", "url": "https://...", "w": 80, "h": 70, "x": 50, "y": 50, "rot": 0, "opacity": 100, "blend": "normal" },
  "icons": [{ "src": "https://img.icons8.com/fluency/96/artificial-intelligence.png", "x": 50, "y": 15, "size": 120, "rot": 0, "opacity": 90 }],
  "brands": [{ "text": "@YOURBRAND", "x": 50, "y": 94, "size": 22, "color": "#4DFFA0", "font": "Space Mono", "weight": 700, "align": "center", "letterSpacing": 3, "opacity": 70 }],
  "textBlocks": [{ "type": "headline|title|subtitle|body|bullet", "text": "Your text", "x": 50, "y": 30, "rot": 0, "size": 96, "font": "Bebas Neue", "weight": "700", "color": "#ffffff", "align": "center", "lineH": 0.95, "letterSpacing": 2, "opacity": 100, "textTransform": "uppercase", "textShadow": "soft", "bgColor": "#000000", "bgAlpha": 0, "bgPad": 0, "bgRadius": 0, "bulletStyle": "symbol", "bulletColor": "#4DFFA0", "bulletSize": 28, "bulletGap": 20, "bulletSymbol": "→" }],
  "logo": { "src": "url|none", "url": "https://...", "w": 150, "h": 0, "anchor": "bl", "mx": 50, "my": 50, "opacity": 100 }
}

═══════════════════════════════════════════════════════════════
CANVAS STATE (preserve what user didn't change):
═══════════════════════════════════════════════════════════════
{{CANVAS_STATE}}

CONVERSATION HISTORY:
{{HISTORY}}

USER REQUEST:
{{USER_MESSAGE}}

Output ONLY the complete JSON design spec now.`;

// ── JSON helpers ──────────────────────────────────────────────────────
function repairJSON(s) {
  if (!s) return s;
  let r = s.replace(/,\s*([}\]])/g, '$1');
  r = r.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m, p) =>
    '"' + p.replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t') + '"');
  r = r.replace(/'\s*:/g,'":').replace(/:\s*'/g,':"');
  return r;
}
function extractJSON(s) {
  if (!s) return null;
  let cleaned = s
    .replace(/```json\s*([\s\S]*?)```/gi, '$1')
    .replace(/```\s*([\s\S]*?)```/gi, '$1')
    .trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth=0, inStr=false, escape=false, end=-1;
  for (let i=start; i<cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape=false; continue; }
    if (c==='\\') { if (inStr) escape=true; continue; }
    if (c==='"') { inStr=!inStr; continue; }
    if (inStr) continue;
    if (c==='{') depth++;
    if (c==='}') { depth--; if (depth===0) { end=i; break; } }
  }
  const candidate = end !== -1 ? cleaned.slice(start,end+1) : cleaned.slice(start);
  try { return JSON.parse(candidate); } catch (_) {}
  try { return JSON.parse(repairJSON(candidate)); } catch (_) {}
  try { return JSON.parse(repairJSON(cleaned)); } catch (_) {}
  return null;
}

// ── Conversation helpers ──────────────────────────────────────────────
function getConversation(id) {
  if (!conversationStore.has(id)) conversationStore.set(id, []);
  return conversationStore.get(id);
}
function addToConversation(id, role, content) {
  const conv = getConversation(id);
  conv.push({ role, content });
  while (conv.length > MAX_HISTORY * 2) conv.shift();
  conversationStore.set(id, conv);
}
function buildPrompt(userMessage, conversationId, canvasState=null) {
  const history = getConversation(conversationId);
  const historyText = history.length
    ? history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    : '(first message in this conversation)';
  const stateText = canvasState ? JSON.stringify(canvasState, null, 2) : '{}';
  return SYSTEM_PROMPT
    .replace('{{CANVAS_STATE}}', stateText)
    .replace('{{HISTORY}}', historyText)
    .replace('{{USER_MESSAGE}}', userMessage);
}

// ── Image wait helpers ────────────────────────────────────────────────
async function waitForImagesToLoad(timeoutMs=12000) {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const imgs = canvas.querySelectorAll('img');
    if ([...imgs].every(i => i.complete && i.naturalWidth > 0)) return;
    await new Promise(r => setTimeout(r, 200));
  }
}
async function waitForBgImage(timeoutMs=8000) {
  const bgEl = document.getElementById('layer-imgbg');
  if (!bgEl) return;
  const url = bgEl.style.backgroundImage.replace(/url\(["']?(.+?)["']?\)/, '$1');
  if (!url || url === 'none') return;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = resolve; img.onerror = resolve; img.src = url;
    setTimeout(resolve, timeoutMs);
  });
}

// ── processPrompt (used by dashboard) ────────────────────────────────
async function processPrompt(options) {
  const { prompt, conversationId, canvasState=null, autoApply=true,
    autoExport=false, returnDataUrl=false, clearCanvasFirst=false } = options;
  if (!prompt) throw new Error('Prompt is required');

  let actualPrompt = prompt;
  let forceReset   = false;
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith(RESET_KEYWORD)) {
    forceReset   = true;
    actualPrompt = trimmedPrompt.slice(RESET_KEYWORD.length).trim();
  }

  const convId = forceReset
    ? `reset_${Date.now()}_${Math.random().toString(36).substr(2,8)}`
    : (conversationId || `default_${Date.now()}`);

  const startTime = Date.now();
  await acquireLock();
  try {
    if (forceReset) conversationStore.delete(convId);
    const effectiveState = forceReset ? { reset:true, timestamp:Date.now() } : canvasState;
    const fullPrompt = buildPrompt(actualPrompt, convId, effectiveState);

    const raw = await callDeepSeek(fullPrompt);
    addToConversation(convId, 'user', prompt);
    addToConversation(convId, 'assistant', raw);

    let spec = extractJSON(raw);
    if (!spec) {
      try {
        const fixPrompt = `Your previous response was not valid JSON. Output ONLY the corrected JSON object — no markdown, no commentary, no code fences. Previous response:\n\n${raw.slice(0,4000)}`;
        const raw2 = await callDeepSeek(fixPrompt);
        addToConversation(convId, 'assistant', raw2);
        spec = extractJSON(raw2);
      } catch (_) {}
    }
    if (!spec) throw new Error('JSON parse failed after retry');

    let result = { success:true, spec, conversationId:convId };

    if (autoApply && window.ContentDesignerAPI) {
      if ((clearCanvasFirst || forceReset) && window.ContentDesignerAPI.resetState) {
        await window.ContentDesignerAPI.resetState();
        await new Promise(r => setTimeout(r, 200));
      }
      await window.ContentDesignerAPI.applyDesign(spec);
      result.applied = true;
      await waitForBgImage(8000);
      await waitForImagesToLoad(12000);
      await new Promise(r => setTimeout(r, 500));

      if (autoExport && window.ContentDesignerAPI.autoExport) {
        const filename  = `design-${convId}-${Date.now()}.png`;
        const exportRes = await window.ContentDesignerAPI.autoExport(filename);
        result.exported = true; result.filename = exportRes.filename;
        if (returnDataUrl && exportRes.dataUrl) result.dataUrl = exportRes.dataUrl;
      } else if (returnDataUrl) {
        const oc = await window.ContentDesignerAPI.renderToCanvas(2);
        if (oc) result.dataUrl = oc.toDataURL('image/png');
      }
    }
    result.duration = Date.now() - startTime;
    return result;
  } catch (err) {
    throw err;
  } finally {
    releaseLock();
  }
}

// ── Streaming modal (NEW) ─────────────────────────────────────────────
//
// Creates a fixed overlay that shows live tokens while the AI is
// generating. Dismissed automatically when the spec is applied (or on
// error). The user can also close it early with the × button.

function createStreamingModal() {
  // Remove any stale one
  const old = document.getElementById('agentStreamModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'agentStreamModal';
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(7,9,15,0.82);
    backdrop-filter:blur(6px); z-index:99999;
    display:flex; align-items:center; justify-content:center;
    animation:agentFadeIn 0.2s ease;
  `;

  // Inject keyframes once
  if (!document.getElementById('agentStreamModalStyles')) {
    const style = document.createElement('style');
    style.id = 'agentStreamModalStyles';
    style.textContent = `
      @keyframes agentFadeIn  { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
      @keyframes agentFadeOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.96)} }
      @keyframes agentBlink   { 0%,100%{opacity:1} 50%{opacity:0} }
      #agentStreamModal .asm-cursor { display:inline-block; width:2px; height:1.1em;
        background:#4DFFA0; margin-left:2px; vertical-align:text-bottom;
        animation:agentBlink 0.7s infinite; }
    `;
    document.head.appendChild(style);
  }

  modal.innerHTML = `
    <div style="
      background:#0D1018; border:1px solid #263048; border-radius:14px;
      width:min(680px,94vw); max-height:82vh; display:flex; flex-direction:column;
      overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.7);
    ">
      <!-- header -->
      <div style="
        display:flex; align-items:center; gap:10px; padding:14px 18px;
        border-bottom:1px solid #1C2438;
        background:linear-gradient(135deg,rgba(77,255,160,0.06),rgba(77,159,255,0.06));
      ">
        <div style="width:8px;height:8px;border-radius:50%;background:#4DFFA0;
          box-shadow:0 0 8px #4DFFA0; animation:agentBlink 1.2s infinite;" id="asmDot"></div>
        <span style="font-family:'Space Mono',monospace;font-size:12px;color:#4DFFA0;
          letter-spacing:1px;">DESIGN AGENT</span>
        <span id="asmPhase" style="font-family:'Space Mono',monospace;font-size:10px;
          color:#6A7A9A; margin-left:4px;">generating…</span>
        <button id="asmClose" style="
          margin-left:auto; background:transparent; border:none; color:#4A5A7A;
          cursor:pointer; font-size:18px; padding:2px 6px; border-radius:4px;
          transition:color .15s;
        " title="Close">✕</button>
      </div>

      <!-- streaming text -->
      <div id="asmBody" style="
        flex:1; overflow-y:auto; padding:16px 18px;
        font-family:'Space Mono',monospace; font-size:11px; line-height:1.7;
        color:#6A7A9A; white-space:pre-wrap; word-break:break-all;
        max-height:52vh;
      ">Waiting for AI response<span class="asm-cursor"></span></div>

      <!-- footer status -->
      <div id="asmFooter" style="
        padding:10px 18px; border-top:1px solid #1C2438;
        font-family:'Space Mono',monospace; font-size:10px; color:#4A5A7A;
        display:flex; align-items:center; gap:10px;
      ">
        <span id="asmTokenCount">0 tokens</span>
        <span style="margin-left:auto;" id="asmFooterMsg">Streaming…</span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close button
  modal.querySelector('#asmClose').addEventListener('click', () => dismissStreamingModal());

  // Click outside to dismiss only after completion
  modal._canDismissOnOverlay = false;
  modal.addEventListener('click', e => {
    if (e.target === modal && modal._canDismissOnOverlay) dismissStreamingModal();
  });

  return modal;
}

function updateStreamingModal(modal, tokenCount, fullContent, phase) {
  if (!modal) return;
  const body      = modal.querySelector('#asmBody');
  const phaseEl   = modal.querySelector('#asmPhase');
  const tokenEl   = modal.querySelector('#asmTokenCount');
  const footerMsg = modal.querySelector('#asmFooterMsg');

  if (body) {
    body.textContent = fullContent;
    // Add blinking cursor span
    const cursor = document.createElement('span');
    cursor.className = 'asm-cursor';
    body.appendChild(cursor);
    body.scrollTop = body.scrollHeight;
  }
  if (phaseEl && phase)   phaseEl.textContent = phase;
  if (tokenEl) tokenEl.textContent = `${tokenCount} tokens`;
  if (footerMsg) footerMsg.textContent = phase || 'Streaming…';
}

function finalizeStreamingModal(modal, success, message) {
  if (!modal) return;
  const dot       = modal.querySelector('#asmDot');
  const phaseEl   = modal.querySelector('#asmPhase');
  const footerMsg = modal.querySelector('#asmFooterMsg');
  const body      = modal.querySelector('#asmBody');

  // Remove cursor
  const cursor = body?.querySelector('.asm-cursor');
  if (cursor) cursor.remove();

  if (dot) {
    dot.style.animation = 'none';
    dot.style.background = success ? '#4DFFA0' : '#FF4D6B';
    dot.style.boxShadow  = success ? '0 0 8px #4DFFA0' : '0 0 8px #FF4D6B';
  }
  if (phaseEl)   phaseEl.textContent   = success ? 'done ✓' : 'error ✗';
  if (footerMsg) footerMsg.textContent  = message || (success ? 'Applying design…' : 'Failed');
  if (footerMsg) footerMsg.style.color  = success ? '#4DFFA0' : '#FF4D6B';

  modal._canDismissOnOverlay = true;

  // Auto-dismiss after a short pause so user can see the final state
  setTimeout(() => dismissStreamingModal(modal), success ? 1400 : 3000);
}

function dismissStreamingModal(modal) {
  const el = modal || document.getElementById('agentStreamModal');
  if (!el) return;
  el.style.animation = 'agentFadeOut 0.25s ease forwards';
  setTimeout(() => el.remove(), 260);
}

// ── handleSend (Designer panel send button) ───────────────────────────
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function handleSend() {
  const userMsg = window.DesignerAgentUI?.getInput();
  if (!userMsg) return;

  window.DesignerAgentUI?.clearInput();
  window.DesignerAgentUI?.addMessage('user', escapeHTML(userMsg));
  window.DesignerAgentUI?.busy(true);
  window.DesignerAgentUI?.setStatus('streaming · DeepSeek');

  // Show compact "working" line in panel
  const panelStatusEl = window.DesignerAgentUI?.addMessage('bot',
    '<span style="font-family:\'Space Mono\',monospace;font-size:10px;color:#6A7A9A;">⏳ Generating design spec…</span>');

  // Create the streaming modal
  const modal = createStreamingModal();
  let tokenCount = 0;

  try {
    const convId     = 'ui_chat';
    const fullPrompt = buildPrompt(userMsg, convId, null);

    await callDeepSeekStreaming(
      fullPrompt,
      // onToken
      (token, full) => {
        tokenCount++;
        updateStreamingModal(modal, tokenCount, full, `streaming · ${tokenCount} tokens`);
      },
      // onComplete
      async (finalContent) => {
        addToConversation(convId, 'user', userMsg);
        addToConversation(convId, 'assistant', finalContent);

        const spec = extractJSON(finalContent);

        if (spec && window.ContentDesignerAPI) {
          finalizeStreamingModal(modal, true, 'Applying design to canvas…');
          try {
            await window.ContentDesignerAPI.applyDesign(spec);
            // Update panel message to success
            if (panelStatusEl) {
              panelStatusEl.innerHTML = '<span style="font-family:\'Space Mono\',monospace;font-size:10px;color:#4DFFA0;">✓ Design applied</span>';
              const actions = [
                { label: '💾 Save JSON', onClick: () => downloadJSON(spec) },
                { label: '🖼 Export PNG', onClick: () => document.querySelector('.btn-export')?.click() },
              ];
              window.DesignerAgentUI?.addActions(panelStatusEl, actions);
            }
            window.DesignerAgentUI?.setStatus('ready · DeepSeek');
          } catch (applyErr) {
            if (panelStatusEl) panelStatusEl.innerHTML =
              `<span style="color:#FF4D6B;font-size:10px;">✗ Apply failed: ${escapeHTML(applyErr.message)}</span>`;
            dismissStreamingModal(modal);
            window.DesignerAgentUI?.setStatus('error · DeepSeek');
          }
        } else {
          // No valid JSON — show the raw response in panel
          finalizeStreamingModal(modal, false, 'No valid JSON in response');
          if (panelStatusEl) panelStatusEl.innerHTML =
            `<span style="color:#FFB84D;font-size:10px;">⚠ No design spec found in response</span>`;
          window.DesignerAgentUI?.setStatus('ready · DeepSeek');
        }
        window.DesignerAgentUI?.busy(false);
      },
      // onError
      (err) => {
        console.error('[Agent UI] streaming error:', err);
        finalizeStreamingModal(modal, false, err.message);
        if (panelStatusEl) panelStatusEl.innerHTML =
          `<span style="color:#FF4D6B;font-size:10px;">✗ ${escapeHTML(err.message)}</span>`;
        window.DesignerAgentUI?.setStatus('error · DeepSeek');
        window.DesignerAgentUI?.busy(false);
      }
    );
  } catch (err) {
    console.error('[Agent UI] error:', err);
    finalizeStreamingModal(modal, false, err.message);
    if (panelStatusEl) panelStatusEl.innerHTML =
      `<span style="color:#FF4D6B;font-size:10px;">✗ ${escapeHTML(err.message)}</span>`;
    window.DesignerAgentUI?.setStatus('error · DeepSeek');
    window.DesignerAgentUI?.busy(false);
  }
}

function downloadJSON(spec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `agent-design-${Date.now()}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Chrome extension message listener (guarded) ───────────────────────
if (hasChromeRuntime()) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const opts = request.options || {
      prompt: request.prompt, conversationId: request.conversationId,
      canvasState: request.canvasState, autoApply: request.autoApply !== false,
      autoExport: request.autoExport || false,
      returnDataUrl: request.returnDataUrl || false,
      clearCanvasFirst: request.clearCanvasFirst || false,
    };
    if (['agentProcessPrompt','generateAIImage'].includes(request.action)) {
      processPrompt(opts)
        .then(r  => sendResponse({ success:true,  result: r }))
        .catch(e => sendResponse({ success:false, error:  e.message }));
      return true;
    }
    if (request.action === 'agentClearConversation') {
      clearConversation(request.conversationId);
      sendResponse({ success:true }); return true;
    }
    if (request.action === 'agentGetHistory') {
      sendResponse({ success:true, history: getConversationHistory(request.conversationId) });
      return true;
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────
function clearConversation(id) {
  if (id) conversationStore.delete(id); else conversationStore.clear();
}
function getConversationHistory(id) { return getConversation(id); }

window.DesignerAgentAPI = {
  processPrompt, clearConversation, getConversationHistory, version: '3.6.0',
};

// ── Wire up send button ───────────────────────────────────────────────
const sendBtn  = document.getElementById('agentSend');
if (sendBtn)  sendBtn.addEventListener('click', handleSend);

// Allow Enter (without Shift) to send
const agentInput = document.getElementById('agentInput');
if (agentInput) {
  agentInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
}

const subtitle = document.getElementById('agentSubtitle');
if (subtitle) subtitle.textContent = 'Ready · DeepSeek · Live streaming';

console.log('[Agent API] v3.6 Ready — live streaming modal enabled.');
})();
