// utils/jsonToPrompt.js
// Converts DeepSeek JSON design spec to natural language prompt for Gemini

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

// For regeneration - allows editing
function buildRegenerationPrompt(originalPrompt, userEdits = null) {
  if (userEdits && userEdits.trim()) {
    return userEdits;
  }
  return originalPrompt;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { jsonToImagePrompt, buildRegenerationPrompt };
}