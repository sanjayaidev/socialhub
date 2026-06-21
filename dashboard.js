// dashboard.js v3.0 - with AI Image Mode per post

// ── State ──
let allPlans = {};
let currentPlanKey = null;
let currentPosts = [];    // posts that exist in DB for this plan
let planDayCount = 30;    // total days in the plan (for rendering empty slots)
let isGenerating = false;
let stopGen = false;
let editingDay = null;
let aiModePerPost = {};   // { day: true/false }

// ── Helpers ──
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 2500);
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

// DB operations via API
async function dbLoadPlans() {
  return await apiCall('/api/content-plans?action=getAllPlans', 'GET');
}

async function dbSavePlan({ month, year, posts, planId }) {
  return await apiCall('/api/content-plans?action=savePlan', 'POST', { month, year, posts, planId });
}

async function dbLoadPlanDetails({ planId }) {
  return await apiCall('/api/content-plans?action=getPlanDetails', 'POST', { planId });
}

async function dbDeletePost({ postId }) {
  return await apiCall('/api/content-plans?action=deletePost', 'DELETE', { postId });
}

async function dbDeletePlan({ planId }) {
  return await apiCall('/api/content-plans?action=deletePlan', 'DELETE', { planId });
}

function dbMsg(action, data = {}) {
  // Check if we're in web app mode (not Chrome extension)
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    // Web app mode - use API calls
    switch (action) {
      case 'dbLoadPlans': return dbLoadPlans();
      case 'dbLoadPlanDetails': return dbLoadPlanDetails(data);
      case 'dbSavePlan': return dbSavePlan(data);
      case 'dbDeletePost': return dbDeletePost(data);
      case 'dbDeletePlan': return dbDeletePlan(data);
      default: throw new Error('Unknown action: ' + action);
    }
  }
  // Chrome extension mode
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.success) return reject(new Error(res?.error || 'DB error'));
      resolve(res.result);
    });
  });
}

function sendDesignerPrompt(prompt, conversationId, autoExport = true, returnDataUrl = true) {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    chrome.runtime.sendMessage({
      action: 'designerPrompt',
      prompt, 
      conversationId, 
      autoExport, 
      returnDataUrl,
      requestId
    }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.success) return reject(new Error(res?.error || 'Designer failed'));
      resolve(res.result);
    });
  });
}

// ── AI Mode functions ──
function setAIMode(day, enabled) {
  aiModePerPost[day] = enabled;
  localStorage.setItem(`aiMode_${currentPlanKey}_${day}`, enabled ? 'true' : 'false');
  updateAIModeButton(day, enabled);
}

function updateAIModeButton(day, enabled) {
  const btn = document.querySelector(`.btn-ai-mode[data-day="${day}"]`);
  if (btn) {
    btn.textContent = enabled ? '🤖 AI Mode ON' : '🎨 Designer Mode';
    btn.style.background = enabled ? 'rgba(77,255,160,0.15)' : '';
    btn.style.borderColor = enabled ? 'var(--accent)' : '';
  }
}

function loadAIModeSettings() {
  aiModePerPost = {};
  if (!currentPlanKey) return;
  for (const post of currentPosts) {
    const saved = localStorage.getItem(`aiMode_${currentPlanKey}_${post.day}`);
    if (saved !== null) {
      aiModePerPost[post.day] = saved === 'true';
    } else {
      aiModePerPost[post.day] = false;
    }
  }
}

// ── Convert JSON spec to natural language prompt for Gemini ──
function jsonToImagePrompt(spec, aspectRatio = '1:1') {
  const canvasW = spec.canvasW || 1080;
  const canvasH = spec.canvasH || 1350;
  
  let ar = '1:1';
  if (canvasW === 1080 && canvasH === 1350) ar = '4:5';
  else if (canvasW === 1080 && canvasH === 1920) ar = '9:16';
  else if (canvasW === 1080 && canvasH === 1080) ar = '1:1';
  
  let prompt = `Create a ${ar} Instagram social media design with:\n\n`;
  
  // Background
  if (spec.bg) {
    if (spec.bg.type === 'solid') {
      prompt += `BACKGROUND: Solid ${spec.bg.color}\n`;
    } else if (spec.bg.type === 'linear') {
      prompt += `BACKGROUND: Linear gradient from ${spec.bg.c1} to ${spec.bg.c2}${spec.bg.c3 ? ' to ' + spec.bg.c3 : ''} at ${spec.bg.angle}° angle\n`;
    } else if (spec.bg.type === 'radial') {
      prompt += `BACKGROUND: Radial gradient from ${spec.bg.c1} to ${spec.bg.c2}${spec.bg.c3 ? ' to ' + spec.bg.c3 : ''}\n`;
    }
  }
  
  // Image background if present
  if (spec.imgBg && spec.imgBg.src !== 'none' && spec.imgBg.url) {
    prompt += `BACKGROUND IMAGE: A professional background photo (dark, moody, abstract) with dark overlay for text readability\n`;
  }
  
  // Text blocks
  if (spec.textBlocks && spec.textBlocks.length) {
    prompt += `\nTEXT CONTENT:\n`;
    spec.textBlocks.forEach(block => {
      const align = block.align || 'center';
      const position = align === 'center' ? 'centered' : (align === 'left' ? 'left-aligned' : 'right-aligned');
      
      if (block.type === 'headline') {
        prompt += `- MAIN HEADLINE: "${block.text}" - large bold font, ${position}, color ${block.color}\n`;
      } else if (block.type === 'title') {
        prompt += `- TITLE: "${block.text}" - bold font, ${position}, color ${block.color}\n`;
      } else if (block.type === 'subtitle') {
        prompt += `- SUBTITLE: "${block.text}" - medium font, ${position}, color ${block.color}\n`;
      } else if (block.type === 'bullet') {
        const lines = block.text.split('\n').filter(l => l.trim());
        prompt += `- BULLET POINTS:\n`;
        lines.forEach(line => {
          prompt += `  • ${line.trim()}\n`;
        });
      } else if (block.type === 'body') {
        prompt += `- BODY TEXT: "${block.text}" - regular font, ${position}, color ${block.color}\n`;
      }
    });
  }
  
  // Icons
  if (spec.icons && spec.icons.length) {
    prompt += `\nICONS: Include ${spec.icons.length} small decorative icons related to the content, placed strategically around the design\n`;
  }
  
  // Brand signature
  if (spec.brands && spec.brands.length) {
    prompt += `\nBRAND SIGNATURE: Include "${spec.brands[0].text}" at bottom ${spec.brands[0].align === 'center' ? 'center' : (spec.brands[0].x < 50 ? 'left' : 'right')} corner, color ${spec.brands[0].color}\n`;
  }
  
  // Style direction
  prompt += `\nSTYLE: Modern, professional, high contrast, social media optimized. Clean typography, proper spacing, visually striking. Dark theme with neon/bright accent colors. No watermark.`;
  
  return prompt;
}

// ── Load plans ──
async function loadPlans() {
  allPlans = await dbMsg('dbLoadPlans');
  const sel = document.getElementById('planSelect');
  sel.innerHTML = Object.entries(allPlans).map(([k, p]) =>
    `<option value="${k}">${p.month} ${p.year} (${p.post_count || 0} posts)</option>`
  ).join('');
  if (Object.keys(allPlans).length > 0) {
    currentPlanKey = Object.keys(allPlans)[0];
    sel.value = currentPlanKey;
    await loadPlan(currentPlanKey);
  } else {
    document.getElementById('calendar').innerHTML = '<div class="empty-state"><h2>No plans yet</h2><p>Generate ideas in the side panel first.</p></div>';
  }
}

// ── Load a specific plan ──
async function loadPlan(key) {
  currentPlanKey = key;
  const plan = allPlans[key];
  if (!plan) return;

  currentPosts = await dbMsg('dbLoadPlanDetails', { planId: plan.id || key });

  // Infer total day count from the highest day number
  planDayCount = currentPosts.length > 0 ? Math.max(...currentPosts.map(p => p.day)) : 30;

  document.getElementById('planMeta').textContent = `${plan.month} ${plan.year} · ${currentPosts.length} posts`;

  let imageCount = 0;
  currentPosts.forEach(p => { imageCount += (p.images || []).length; });
  document.getElementById('statTotal').textContent = currentPosts.length;
  document.getElementById('statImages').textContent = imageCount;
  document.getElementById('statPending').textContent = currentPosts.filter(p => !p.images?.length).length;
  document.getElementById('genAllBtn').disabled = false;
  
  loadAIModeSettings();
  renderCalendar();
}

// ── Build image prompt string for the designer ──
function buildDesignPrompt(post, slide = null, slideNum = null, totalSlides = null) {
  const type = post.type || 'single';
  const role = slide?.role || 'first';
  const dims = {
    single: '1080×1080 square',
    carousel: '1080×1350 portrait',
    story: '1080×1920 vertical story',
    'reel-cover': '1080×1920 vertical reel cover'
  }[type] || '1080×1080';

  let prompt = '';

  if (type === 'single') {
    prompt = `Create an Instagram single post design (${dims}).

TITLE: ${post.title}
HOOK: ${post.hook || ''}
${post.bullets?.length ? `BULLETS: ${post.bullets.join(' | ')}` : ''}

VISUAL DIRECTION: ${post.image_prompt || 'Modern, high contrast, professional'}

Design requirements: Strong visual hierarchy, bold typography, eye-catching composition. Include brand signature "@brand" at bottom. Use the visual direction above as creative guidance for background, colors, and imagery.`;

  } else if (type === 'carousel') {
    if (!slide || role === 'first') {
      prompt = `Create the COVER SLIDE for a carousel series (${dims}).

SERIES TITLE: ${post.title}
HOOK: ${post.hook || ''}
VISUAL STYLE: ${post.image_prompt || 'Modern, bold, high contrast'}

Make it attention-grabbing with large bold headline, "SWIPE →" indicator, strong visual impact. This sets the color/style theme for all ${totalSlides || ''} slides. Include brand signature at bottom.`;
    } else if (role === 'last') {
      prompt = `Create the FINAL SLIDE for this carousel series (${dims}).

SERIES: "${post.title}"
CTA: ${slide?.cta || post.cta || 'Follow for more tips'}
VISUAL STYLE: ${post.image_prompt || 'Match the cover slide style'}

Include "SAVE THIS FOR LATER" or "SHARE THIS" as main headline, the CTA text, "← BACK TO START" indicator. MAINTAIN the SAME color scheme and visual style as previous slides. Brand signature at bottom.`;
    } else {
      prompt = `Create CONTENT SLIDE ${slideNum} of ${totalSlides} for this carousel (${dims}).

SERIES: "${post.title}"
SLIDE TITLE: ${slide?.title || ''}
${slide?.body ? `CONTENT: ${slide.body}` : ''}
${slide?.bullets?.length ? `BULLETS: ${slide.bullets.join(' | ')}` : ''}
SLIDE VISUAL: ${slide?.image_prompt || post.image_prompt || 'Match series style'}

Requirements: SAME color/style as previous slides. Slide counter ${slideNum}/${totalSlides}. Clean typography, left-aligned preferred. Brand signature at bottom.`;
    }
  } else if (type === 'story') {
    prompt = `Create an Instagram Story design (${dims}).

TAG: ${post.tag || 'QUESTION OF THE DAY'}
TITLE: ${post.title}
HOOK: ${post.hook || ''}
VISUAL DIRECTION: ${post.image_prompt || 'Bold, vertical, mobile-first'}

Vertical layout optimized for mobile. Large bold text. Include brand signature at bottom.`;
  } else if (type === 'reel-cover') {
    prompt = `Create a Reel Cover design (${dims}).

TAG: ${post.tag || '▶ REEL'}
TITLE: ${post.title}
HOOK: ${post.hook || ''}
VISUAL DIRECTION: ${post.image_prompt || 'Bold, high contrast, thumb-stopping'}

High impact vertical design. Bold headline dominates. Include brand signature at bottom.`;
  }

  if (type === 'carousel' && slide && role !== 'first') {
    prompt += `\n\nCRITICAL: Maintain IDENTICAL visual theme, color palette, and typography style as the previous slides in this carousel session.`;
  }

  return prompt;
}

// ── Generate image for a post (supports both Designer and AI Mode - NOT BOTH) ──
async function generateImageForPost(post, onProgress) {
  const type = post.type || 'single';
  const results = [];
  const useAIMode = aiModePerPost[post.day] === true;
  
  console.log(`[Dashboard] Day ${post.day} - Using ${useAIMode ? 'AI MODE (Gemini only)' : 'DESIGNER MODE only'}`);
  
  if (type === 'carousel') {
    const slides = post.slides || [];
    for (let s = 0; s < slides.length; s++) {
      if (stopGen) break;
      const slide = slides[s];
      onProgress?.(`Slide ${s + 1}/${slides.length}...`);
      
      const slideConvId = `carousel_${post.day}_slide${s + 1}`;
      const resetPrompt = `[COMPLETE RESET] 
      
IMPORTANT: Clear the canvas completely. Start from a blank state. Do NOT preserve anything from previous designs.

Create a brand new design for:
${buildDesignPrompt(post, slide, s + 1, slides.length)}`;
      
      console.log(`[Dashboard] Generating slide ${s + 1} with convId: ${slideConvId}`);
      
      try {
        // First get JSON spec from DeepSeek (needed for BOTH modes)
        onProgress?.(`Getting design spec...`);
        const result = await sendDesignerPrompt(resetPrompt, slideConvId, false, true);
        
        if (!result?.spec) {
          throw new Error('No design spec received from DeepSeek');
        }
        
        if (useAIMode) {
          // ========== AI MODE: Send JSON to Gemini for image generation ==========
          onProgress?.(`🤖 AI generating image with Gemini...`);
          
          const aspectRatio = '4:5'; // Carousel is 1080x1350 = 4:5
          
          const aiResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'generateAIImageFromSpec',
              designSpec: result.spec,
              aspectRatio: aspectRatio,
              day: post.day,
              slideIndex: s,
              type: type,
              planId: currentPlanKey
            }, (res) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              if (!res?.success) reject(new Error(res?.error || 'AI image generation failed'));
              resolve(res.result);
            });
          });
          
          if (aiResult?.imageUrl) {
            results.push({ 
              slideNum: s + 1, 
              role: slide.role, 
              dataUrl: aiResult.imageUrl, 
              filename: `ai_day${post.day}_s${s+1}.png` 
            });
            
            if (post.slides[s]) {
              post.slides[s] = { 
                ...post.slides[s], 
                designSpec: result.spec,
                generatedAsset: aiResult.imageUrl, 
                aiGenerated: true,
                status: 'complete' 
              };
            }
            onProgress?.(`Slide ${s + 1} AI complete ✓`);
          } else {
            throw new Error('No image URL returned from Gemini');
          }
          
        } else {
          // ========== DESIGNER MODE: Render via canvas ==========
          onProgress?.(`🎨 Rendering with Designer...`);
          
          const renderResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'renderDesignFromSpec',
              designSpec: result.spec,
              day: post.day,
              type: type,
              slideIndex: s
            }, (res) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              if (!res?.success) reject(new Error(res?.error || 'Render failed'));
              resolve(res.result);
            });
          });
          
          if (renderResult?.dataUrl) {
            results.push({ 
              slideNum: s + 1, 
              role: slide.role, 
              dataUrl: renderResult.dataUrl, 
              filename: renderResult.filename 
            });
            
            if (post.slides[s]) {
              post.slides[s] = { 
                ...post.slides[s], 
                designSpec: result.spec,
                generatedAsset: renderResult.dataUrl, 
                aiGenerated: false,
                status: 'complete' 
              };
            }
            onProgress?.(`Slide ${s + 1} rendered ✓`);
          } else {
            throw new Error('No data URL from renderer');
          }
        }
        
      } catch (err) {
        console.error(`[Dashboard] Slide ${s + 1} error:`, err);
        onProgress?.(`Slide ${s + 1} error: ${err.message}`);
      }
      
      // Wait between slides
      if (s < slides.length - 1) {
        onProgress?.(`Waiting 2 seconds before next slide...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } else {
    // ========== SINGLE POST (non-carousel) ==========
    onProgress?.('Getting design spec from DeepSeek...');
    const convId = `single_${post.day}_${Date.now()}`;
    const prompt = buildDesignPrompt(post, null, 1, 1);
    
    try {
      const result = await sendDesignerPrompt(prompt, convId, false, true);
      
      if (!result?.spec) {
        throw new Error('No design spec received from DeepSeek');
      }
      
      if (useAIMode) {
        // ========== AI MODE: Send JSON to Gemini ==========
        onProgress?.('🤖 AI generating image with Gemini...');
        
        const aspectRatio = post.type === 'story' || post.type === 'reel-cover' ? '9:16' : '1:1';
        
        const aiResult = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'generateAIImageFromSpec',
            designSpec: result.spec,
            aspectRatio: aspectRatio,
            day: post.day,
            slideIndex: 0,
            type: type,
            planId: currentPlanKey
          }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            if (!res?.success) reject(new Error(res?.error || 'AI image generation failed'));
            resolve(res.result);
          });
        });
        
        if (aiResult?.imageUrl) {
          results.push({ dataUrl: aiResult.imageUrl, filename: `ai_day${post.day}.png` });
          
          if (!post.slides) post.slides = [];
          post.slides[0] = { 
            role: 'single', 
            designSpec: result.spec,
            generatedAsset: aiResult.imageUrl, 
            aiGenerated: true,
            status: 'complete' 
          };
          onProgress?.('AI image complete ✓');
        } else {
          throw new Error('No image URL returned from Gemini');
        }
        
      } else {
        // ========== DESIGNER MODE: Render via canvas ==========
        onProgress?.('🎨 Rendering with Designer...');
        
        const renderResult = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'renderDesignFromSpec',
            designSpec: result.spec,
            day: post.day,
            type: type,
            slideIndex: 0
          }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            if (!res?.success) reject(new Error(res?.error || 'Render failed'));
            resolve(res.result);
          });
        });
        
        if (renderResult?.dataUrl) {
          results.push({ dataUrl: renderResult.dataUrl, filename: renderResult.filename });
          
          if (!post.slides) post.slides = [];
          post.slides[0] = { 
            role: 'single', 
            designSpec: result.spec,
            generatedAsset: renderResult.dataUrl, 
            aiGenerated: false,
            status: 'complete' 
          };
          onProgress?.('Design rendered ✓');
        } else {
          throw new Error('No data URL from renderer');
        }
      }
      
    } catch (err) {
      console.error(`[Dashboard] Single post error:`, err);
      onProgress?.(`Error: ${err.message}`);
      throw err;
    }
  }

  return results;
}

// ── Auto-save a single post after generation ──
async function autoSavePost(post) {
  try {
    const plan = allPlans[currentPlanKey];
    await dbMsg('dbSavePlan', { month: plan.month, year: plan.year, posts: currentPosts, planId: currentPlanKey });
  } catch (err) {
    console.warn('[Dashboard] Auto-save failed:', err.message);
  }
}

// ── Lock/unlock all Generate buttons on cards ──
function setAllGenButtonsDisabled(disabled) {
  document.querySelectorAll('[data-action="gen"]').forEach(btn => {
    btn.disabled = disabled;
  });
}

// ── Generate all pending images ──
async function generateAll() {
  const pending = currentPosts.filter(p => !p.images?.length);
  if (!pending.length) { toast('All posts already have images!'); return; }

  isGenerating = true;
  stopGen = false;
  setAllGenButtonsDisabled(true);
  document.getElementById('genAllBtn').disabled = true;
  document.getElementById('stopGenBtn').style.display = 'block';
  document.getElementById('genBar').style.display = 'flex';

  let done = 0;
  const total = pending.length;

  for (const post of pending) {
    if (stopGen) break;

    const modeText = aiModePerPost[post.day] ? '🤖 AI Mode' : '🎨 Designer';
    setCardGenerating(post.day, true, `${modeText} - Connecting...`);
    document.getElementById('genStatus').textContent = `Day ${post.day}: ${post.type} (${modeText})`;
    document.getElementById('genFraction').textContent = `${done}/${total}`;
    document.getElementById('genProgressFill').style.width = `${(done / total) * 100}%`;

    try {
      const results = await generateImageForPost(post, (msg) => {
        setCardGenerating(post.day, true, msg);
        document.getElementById('genStatus').textContent = `Day ${post.day}: ${msg}`;
      });

      if (results.length > 0) {
        post.images = results.map(r => r.dataUrl);
        post.status = 'complete';
        setCardGenerating(post.day, false);
        renderCard(post);
        await autoSavePost(post);
        toast(`✓ Day ${post.day} done (${modeText})`);
      }
    } catch (err) {
      setCardGenerating(post.day, false);
      setCardError(post.day, err.message);
      toast(`✗ Day ${post.day}: ${err.message}`, 'error');
    }

    done++;
    document.getElementById('statImages').textContent = currentPosts.filter(p => p.images?.length).length;
    document.getElementById('statPending').textContent = currentPosts.filter(p => !p.images?.length).length;
  }

  document.getElementById('genProgressFill').style.width = '100%';
  document.getElementById('genStatus').textContent = stopGen ? 'Stopped' : '✓ Complete';
  document.getElementById('genFraction').textContent = `${done}/${total}`;
  document.getElementById('genAllBtn').disabled = false;
  document.getElementById('stopGenBtn').style.display = 'none';
  isGenerating = false;
  setAllGenButtonsDisabled(false);
  toast(stopGen ? `Stopped after ${done} posts` : `✓ All images generated!`);
}

// ── Save all images to database manually ──
async function saveAllToDatabase() {
  const postsWithImages = currentPosts.filter(p => p.images?.length > 0);
  if (postsWithImages.length === 0) {
    toast('No images to save. Generate images first.', 'error');
    return;
  }
  try {
    const plan = allPlans[currentPlanKey];
    await dbMsg('dbSavePlan', { month: plan.month, year: plan.year, posts: currentPosts, planId: currentPlanKey });
    toast(`✓ Saved ${postsWithImages.length} posts with images to database`);
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
  }
}

// ── Generate image for single card ──
async function generateSingleCard(day) {
  if (isGenerating) { toast('⏳ Already generating — please wait', 'error'); return; }
  const post = currentPosts.find(p => p.day === day);
  if (!post) return;

  isGenerating = true;
  setAllGenButtonsDisabled(true);
  const modeText = aiModePerPost[day] ? '🤖 AI Mode' : '🎨 Designer';
  setCardGenerating(day, true, `${modeText} - Starting...`);
  
  try {
    const results = await generateImageForPost(post, (msg) => setCardGenerating(day, true, msg));
    if (results.length > 0) {
      post.images = results.map(r => r.dataUrl);
      post.status = 'complete';
      await autoSavePost(post);
      setCardGenerating(day, false);
      renderCard(post);
      document.getElementById('statImages').textContent = currentPosts.filter(p => p.images?.length).length;
      document.getElementById('statPending').textContent = currentPosts.filter(p => !p.images?.length).length;
      toast(`✓ Day ${day} image generated (${modeText})`);
    } else {
      throw new Error('No images generated');
    }
  } catch (err) {
    setCardGenerating(day, false);
    setCardError(day, err.message);
    toast(`✗ Day ${day}: ${err.message}`, 'error');
  } finally {
    isGenerating = false;
    setAllGenButtonsDisabled(false);
  }
}

// ── Delete a single day's post ──
async function deleteDay(day) {
  const post = currentPosts.find(p => p.day === day);
  if (!post) return;
  if (!confirm(`Delete Day ${day} (${post.title?.slice(0, 40) || post.type})? This cannot be undone.`)) return;

  try {
    const postId = post.postId;
    if (postId) {
      await dbMsg('dbDeletePost', { postId });
    }
    currentPosts = currentPosts.filter(p => p.day !== day);
    renderCalendar();
    updateStats();
    toast(`✓ Day ${day} deleted`);
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

// ── Delete entire plan ──
async function deletePlan() {
  const plan = allPlans[currentPlanKey];
  if (!plan) return;
  if (!confirm(`Delete the entire plan for ${plan.month} ${plan.year}? All ${currentPosts.length} posts and images will be permanently deleted.`)) return;

  try {
    await dbMsg('dbDeletePlan', { planId: plan.id || currentPlanKey });
    delete allPlans[currentPlanKey];
    currentPosts = [];
    currentPlanKey = null;
    toast(`✓ Plan deleted`);
    await loadPlans();
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

// ── Regenerate text ideas for a single day ──
async function regenerateDayIdeas(day) {
  const plan = allPlans[currentPlanKey];
  if (!plan) return;

  const card = document.querySelector(`[data-day="${day}"]`);
  if (card) {
    const preview = card.querySelector('.card-preview');
    if (preview) preview.innerHTML = `<div class="preview-placeholder"><div class="icon">⏳</div><div class="txt">Generating ideas...</div></div>`;
  }

  try {
    const raw = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        action: 'execute', provider: 'deepseek', actionType: 'prompt',
        params: { message: `You are an Instagram content strategist. Generate exactly 1 post for Day ${day} of ${plan.month} ${plan.year}.

Output a single JSON object (not an array) with these fields:
day, type (single/carousel/story/reel-cover), title, hook, bullets (array, single only), caption (300-400 chars with emojis), hashtags (array, no # prefix), image_prompt (visual description), slides (array for carousel only).

Output raw JSON only. No markdown.` }
      }, res => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.success) return reject(new Error(res?.error || 'Failed'));
        resolve(res.result);
      });
    });

    let ideas = [];
    try {
      const cleaned = raw.replace(/```json\s*([\s\S]*?)```/gi, '$1').replace(/```\s*([\s\S]*?)```/gi, '$1').trim();

      const arrStart = cleaned.indexOf('[');
      const arrEnd = cleaned.lastIndexOf(']');
      if (arrStart !== -1 && arrEnd !== -1 && arrStart < arrEnd) {
        try {
          const parsed = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
          if (Array.isArray(parsed)) ideas = parsed;
        } catch (e) {}
      }

      if (!ideas.length) {
        let i = 0;
        while (i < cleaned.length) {
          const start = cleaned.indexOf('{', i);
          if (start === -1) break;
          let depth = 0, inStr = false, escape = false, end = -1;
          for (let j = start; j < cleaned.length; j++) {
            const c = cleaned[j];
            if (escape) { escape = false; continue; }
            if (c === '\\' && inStr) { escape = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{') depth++;
            if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
          }
          if (end === -1) break;
          try {
            const obj = JSON.parse(cleaned.slice(start, end + 1));
            if (obj && typeof obj === 'object') ideas.push(obj);
          } catch (e) {}
          i = end + 1;
        }
      }
    } catch (e) { throw new Error('Could not parse AI response'); }

    if (!ideas.length) throw new Error('No ideas returned from AI');

    for (const idea of ideas) {
      const targetDay = idea.day || day;
      const record = {
        day: targetDay,
        type: idea.type || 'single',
        title: idea.title || '',
        hook: idea.hook || '',
        caption: idea.caption || '',
        hashtags: idea.hashtags || [],
        image_prompt: idea.image_prompt || '',
        bullets: idea.bullets || [],
        slides: (idea.slides || []).map(s => ({ ...s, image_prompt: s.image_prompt || '' })),
        cta: idea.cta || '',
        tag: idea.tag || '',
        images: [],
        status: 'ideas_ready'
      };

      const existing = currentPosts.find(p => p.day === targetDay);
      if (existing) {
        Object.assign(existing, record);
      } else {
        currentPosts.push(record);
      }
    }
    currentPosts.sort((a, b) => a.day - b.day);

    await dbMsg('dbSavePlan', { month: plan.month, year: plan.year, posts: currentPosts, planId: currentPlanKey });
    renderCalendar();
    updateStats();
    const savedDays = ideas.map(i => i.day || day).join(', ');
    toast(`✓ Day ${savedDays} ideas regenerated`);
  } catch (err) {
    toast(`✗ Day ${day} regen failed: ${err.message}`, 'error');
    renderCalendar();
  }
}

function updateStats() {
  document.getElementById('statTotal').textContent = currentPosts.length;
  document.getElementById('statImages').textContent = currentPosts.filter(p => p.images?.length).length;
  document.getElementById('statPending').textContent = currentPosts.filter(p => !p.images?.length).length;
}

function setCardGenerating(day, on, msg = '') {
  const card = document.querySelector(`[data-day="${day}"]`);
  if (!card) return;
  card.classList.toggle('generating', on);
  const overlay = card.querySelector('.preview-gen-overlay');
  const statusEl = card.querySelector('.card-status');
  if (on) {
    if (!overlay) {
      const preview = card.querySelector('.card-preview');
      if (preview) {
        const ov = document.createElement('div');
        ov.className = 'preview-gen-overlay';
        ov.innerHTML = `<div class="gen-spinner"></div><div class="gen-overlay-text">${msg}</div>`;
        preview.appendChild(ov);
      }
    } else {
      overlay.querySelector('.gen-overlay-text').textContent = msg;
    }
    if (statusEl) { statusEl.textContent = 'generating'; statusEl.className = 'card-status generating'; }
  } else {
    overlay?.remove();
    card.classList.remove('generating');
    if (statusEl) { statusEl.textContent = 'ready'; statusEl.className = 'card-status ready'; }
  }
}

function setCardError(day, msg) {
  const card = document.querySelector(`[data-day="${day}"]`);
  if (!card) return;
  const preview = card.querySelector('.card-preview');
  if (preview) preview.innerHTML = `<div class="preview-placeholder"><div class="icon">✗</div><div class="txt" style="color:var(--error);">${msg.slice(0, 60)}</div></div>`;
}

// ── Render calendar ──
function renderCalendar() {
  const cal = document.getElementById('calendar');
  if (!allPlans[currentPlanKey]) {
    cal.innerHTML = '<div class="empty-state"><h2>No plan loaded</h2></div>';
    return;
  }
  cal.innerHTML = '';

  const postByDay = {};
  currentPosts.forEach(p => { postByDay[p.day] = p; });

  for (let day = 1; day <= planDayCount; day++) {
    const post = postByDay[day];
    if (post) {
      cal.appendChild(buildCard(post));
    } else {
      cal.appendChild(buildEmptySlot(day));
    }
  }
}

// ── Empty slot for deleted/missing days ──
function buildEmptySlot(day) {
  const div = document.createElement('div');
  div.className = 'day-card';
  div.dataset.day = day;
  div.style.opacity = '0.5';
  div.innerHTML = `
    <div class="card-header">
      <span class="card-day">DAY ${day}</span>
      <span class="card-status" style="color:var(--muted);">empty</span>
    </div>
    <div class="card-preview">
      <div class="preview-placeholder">
        <div class="icon">○</div>
        <div class="txt">No content for this day</div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-actions">
        <button class="btn btn-generate" data-action="regen-ideas" data-day="${day}">✦ Generate Day ${day}</button>
      </div>
    </div>`;

  div.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      const d = parseInt(e.currentTarget.dataset.day);
      if (action === 'regen-ideas') regenerateDayIdeas(d);
    });
  });
  return div;
}

function renderCard(post) {
  const existing = document.querySelector(`[data-day="${post.day}"]`);
  if (!existing) return;
  existing.replaceWith(buildCard(post));
}

function buildCard(post) {
  const type = post.type || 'single';
  const hasImages = post.images?.length > 0;
  const isAIMode = aiModePerPost[post.day] === true;
  const div = document.createElement('div');
  div.className = `day-card${hasImages ? ' has-image' : ''}`;
  div.dataset.day = post.day;

  const badgeClass = {
    single: 'badge-single', carousel: 'badge-carousel',
    story: 'badge-story', 'reel-cover': 'badge-reel-cover'
  }[type] || 'badge-single';

  let previewHtml = '';
  if (hasImages && post.images.length === 1) {
    previewHtml = `<img src="${post.images[0]}" alt="Day ${post.day}" loading="lazy">`;
  } else if (hasImages && post.images.length > 1) {
    previewHtml = post.images.slice(0, 3).map(url =>
      `<img src="${url}" alt="slide" loading="lazy">`
    ).join('');
  } else {
    previewHtml = `<div class="preview-placeholder"><div class="icon">${{ single: '🖼', carousel: '📑', story: '📱', 'reel-cover': '🎬' }[type] || '🖼'}</div><div class="txt">No image yet</div></div>`;
  }

  let slidesHtml = '';
  if (type === 'carousel' && post.slides?.length) {
    slidesHtml = `<div class="slides-list">${post.slides.map((s, i) => {
      const imgDone = post.images?.[i];
      return `<div class="slide-item"><span class="slide-num">${String(i + 1).padStart(2, '0')}</span><span class="slide-title">${s.title || s.role}</span><span class="slide-status ${imgDone ? 'done' : ''}">${imgDone ? '✓' : '○'}</span></div>`;
    }).join('')}</div>`;
  }

  const tags = (post.hashtags || []).slice(0, 5).map(t => `<span class="hashtag">#${t}</span>`).join('');
  const postId = post.postId || '';

  div.innerHTML = `
    <div class="card-header">
      <span class="card-day">DAY ${post.day}</span>
      <span class="card-type-badge ${badgeClass}">${type}</span>
      <span class="card-status ${hasImages ? 'ready' : ''}">${hasImages ? '✓ ready' : 'pending'}</span>
    </div>
    <div class="card-preview ${type === 'carousel' && hasImages && post.images.length > 1 ? 'carousel-preview' : ''}">${previewHtml}</div>
    <div class="card-body">
      <div class="card-title">${post.title || 'Untitled'}</div>
      ${post.caption ? `<div class="card-caption">${post.caption}</div>` : ''}
      ${tags ? `<div class="card-hashtags">${tags}</div>` : ''}
      ${post.image_prompt ? `<div class="card-prompt" title="Click to expand">${post.image_prompt.slice(0, 100)}${post.image_prompt.length > 100 ? '...' : ''}</div>` : ''}
      ${slidesHtml}
      <div class="card-actions">
        <button class="btn btn-ai-mode" data-action="toggle-ai-mode" data-day="${post.day}" style="font-size:8px;padding:4px 8px;${isAIMode ? 'background:rgba(77,255,160,0.15);border-color:var(--accent);' : ''}">
          ${isAIMode ? '🤖 AI Mode ON' : '🎨 Designer Mode'}
        </button>
        <button class="btn btn-generate" data-action="gen" data-day="${post.day}" ${isGenerating ? 'disabled' : ''}>
          ${hasImages ? '↻ Regenerate' : '⚡ Generate Image'}
        </button>
        <button class="btn btn-edit-prompt" data-action="edit" data-day="${post.day}">✎ Edit</button>
        <button class="btn btn-view-caption" data-action="caption" data-day="${post.day}">📋 Caption</button>
        ${hasImages ? `<button class="btn btn-download" data-action="download" data-day="${post.day}">↓ Save</button>` : ''}
        ${hasImages && type !== 'carousel' && !isAIMode ? `<button class="btn" style="color:var(--accent);border-color:rgba(77,255,160,0.3);" data-action="opendesigner" data-day="${post.day}" data-slide="0" data-postid="${postId}">✏️ Edit in Designer</button>` : ''}
        ${hasImages && isAIMode ? `<button class="btn" style="color:var(--accent2);border-color:rgba(77,159,255,0.3);" data-action="view-ai-gallery" data-day="${post.day}">🖼 View AI Gallery</button>` : ''}
        <button class="btn btn-danger" data-action="delete" data-day="${post.day}">🗑 Delete</button>
      </div>
      ${hasImages && type === 'carousel' ? `
      <div class="slides-edit-list" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
        ${(post.slides || []).map((s, i) => post.images?.[i] ? `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--s3);border-radius:4px;">
            <span style="font-family:var(--mono);font-size:9px;color:var(--accent);min-width:24px;">S${i+1}</span>
            <span style="flex:1;font-size:10px;color:var(--muted2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.title || s.role || 'Slide ' + (i+1)}</span>
            ${!isAIMode ? `<button class="btn" style="font-size:9px;padding:3px 7px;color:var(--accent);border-color:rgba(77,255,160,0.3);" data-action="opendesigner" data-day="${post.day}" data-slide="${i}" data-postid="${postId}">✏️ Edit</button>` : ''}
          </div>` : '').join('')}
      </div>` : ''}
    </div>`;

  div.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      const day = parseInt(e.currentTarget.dataset.day);
      if (action === 'gen') generateSingleCard(day);
      else if (action === 'edit') openEditModal(day);
      else if (action === 'caption') openCaptionModal(day);
      else if (action === 'download') downloadImages(day);
      else if (action === 'delete') deleteDay(day);
      else if (action === 'toggle-ai-mode') {
        const newMode = !aiModePerPost[day];
        setAIMode(day, newMode);
        toast(`Day ${day}: ${newMode ? 'AI Image Mode (Gemini)' : 'Designer Mode'} enabled`);
        renderCard(post);
      }
      else if (action === 'view-ai-gallery') {
        chrome.tabs.create({ url: chrome.runtime.getURL('ai-designs.html') });
      }
      else if (action === 'opendesigner') {
        const slideIndex = parseInt(e.currentTarget.dataset.slide || '0');
        const pid = e.currentTarget.dataset.postid;
        openSlideInDesigner(day, slideIndex, pid);
      }
    });
  });

  return div;
}

// ── Modals ──
function openEditModal(day) {
  editingDay = day;
  const post = currentPosts.find(p => p.day === day);
  if (!post) return;
  document.getElementById('editModalTitle').textContent = `Day ${day} — Edit`;
  document.getElementById('editTypeSelect').value = post.type || 'single';
  document.getElementById('editPromptInput').value = post.image_prompt || '';
  document.getElementById('editCaptionInput').value = post.caption || '';
  document.getElementById('editHashtagsInput').value = (post.hashtags || []).join(', ');
  document.getElementById('editModal').classList.add('open');
}

function openCaptionModal(day) {
  const post = currentPosts.find(p => p.day === day);
  if (!post) return;
  document.getElementById('captionModalTitle').textContent = `Day ${day} — ${post.title}`;
  document.getElementById('captionModalText').value = post.caption || '(No caption)';
  document.getElementById('captionModalHashtags').value = (post.hashtags || []).map(t => '#' + t).join(' ');
  document.getElementById('captionModal').classList.add('open');
}

async function saveEditModal(andGenerate = false) {
  const post = currentPosts.find(p => p.day === editingDay);
  if (!post) return;
  post.type = document.getElementById('editTypeSelect').value;
  post.image_prompt = document.getElementById('editPromptInput').value;
  post.caption = document.getElementById('editCaptionInput').value;
  post.hashtags = document.getElementById('editHashtagsInput').value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);

  const plan = allPlans[currentPlanKey];
  await dbMsg('dbSavePlan', { month: plan.month, year: plan.year, posts: currentPosts, planId: currentPlanKey });
  renderCard(post);
  document.getElementById('editModal').classList.remove('open');
  toast('✓ Saved');
  if (andGenerate) generateSingleCard(editingDay);
}

function downloadImages(day) {
  const post = currentPosts.find(p => p.day === day);
  if (!post?.images?.length) return;
  post.images.forEach((dataUrl, i) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `day${day}_${post.type}${post.images.length > 1 ? `_s${i + 1}` : ''}.png`;
    a.click();
  });
}

function openSlideInDesigner(day, slideIndex, postId) {
  const post = currentPosts.find(p => p.day === day);
  if (!post) return;

  const slide = post.slides?.[slideIndex] || {};
  const designSpec = slide.designSpec || null;

  if (!designSpec) {
    const usePostId = postId || post.postId || '';
    if (!usePostId) {
      toast('Cannot open: post not yet saved to DB. Save images first.', 'error');
      return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL('designer.html') });
    toast(`Day ${day} opened in Designer (no spec — use AI chat to recreate from prompt)`, 'success');
    return;
  }

  const usePostId = postId || post.postId || '';

  chrome.runtime.sendMessage({
    action: 'openDesignerForEdit',
    designSpec: { ...designSpec, slideMetadata: { day, slideIndex, type: post.type, title: post.title } },
    postId: usePostId,
    slideIndex
  }, (res) => {
    if (chrome.runtime.lastError || !res?.success) {
      toast('Could not open designer: ' + (res?.error || chrome.runtime.lastError?.message), 'error');
    } else {
      toast(`✏️ Day ${day} Slide ${slideIndex + 1} opened in Designer`);
    }
  });
}

// ── Listen for slide updates saved back from designer ──
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'slideUpdatedInDB') {
      toast('✓ Slide edit saved — refreshing...', 'success');
      loadPlan(currentPlanKey);
    }
  });
}

// ── Event listeners ──
document.getElementById('planSelect').addEventListener('change', (e) => loadPlan(e.target.value));
document.getElementById('genAllBtn').addEventListener('click', generateAll);
document.getElementById('stopGenBtn').addEventListener('click', () => { stopGen = true; });
document.getElementById('refreshBtn').addEventListener('click', loadPlans);
document.getElementById('saveDbBtn').addEventListener('click', saveAllToDatabase);

document.getElementById('editModalClose').addEventListener('click', () => document.getElementById('editModal').classList.remove('open'));
document.getElementById('editModalCancel').addEventListener('click', () => document.getElementById('editModal').classList.remove('open'));
document.getElementById('editModalSave').addEventListener('click', () => saveEditModal(false));
document.getElementById('editModalGenerate').addEventListener('click', () => saveEditModal(true));

document.getElementById('captionModalClose').addEventListener('click', () => document.getElementById('captionModal').classList.remove('open'));
document.getElementById('copyCaptionBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('captionModalText').value);
  toast('Caption copied!');
});
document.getElementById('copyHashtagsBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('captionModalHashtags').value);
  toast('Hashtags copied!');
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
});

document.getElementById('deletePlanBtn')?.addEventListener('click', deletePlan);

// Add AI Designs Gallery button to header
const headerActions = document.querySelector('.header-actions');
if (headerActions) {
  const aiGalleryBtn = document.createElement('button');
  aiGalleryBtn.className = 'btn';
  aiGalleryBtn.id = 'aiGalleryBtn';
  aiGalleryBtn.textContent = '🎨 AI Designs Gallery';
  aiGalleryBtn.style.marginRight = 'auto';
  aiGalleryBtn.style.marginLeft = '10px';
  aiGalleryBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('ai-designs.html') });
    } else {
      window.location.href = 'ai-designs.html';
    }
  });
  headerActions.insertBefore(aiGalleryBtn, headerActions.firstChild);
}

// ── Load on start ──
loadPlans().catch(err => {
  console.error('Failed to load plans:', err);
  document.getElementById('calendar').innerHTML = `<div class="empty-state"><h2>Error loading plans</h2><p>${err.message}</p></div>`;
});