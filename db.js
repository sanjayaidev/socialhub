// db.js
import { neon } from 'https://esm.sh/@neondatabase/serverless@0.9.3';

const sql = neon('postgresql://neondb_owner:npg_DUqgZLn9KRB7@ep-soft-tree-ao28mp5p-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

export async function savePlan(month, year, posts, planId = null) {
  if (!planId) planId = `plan_${month}_${year}_${Date.now()}`;

  await sql`
    INSERT INTO plans (id, month, year, status)
    VALUES (${planId}, ${month}, ${year}, 'in_progress')
    ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  `;

  for (const post of posts) {
    const postId = `post_${planId}_day${post.day}`;
    const metadata = JSON.stringify({
      title: post.title, caption: post.caption, hashtags: post.hashtags, image_prompt: post.image_prompt
    });
    const postType = post.type || 'single';
    const postStatus = post.status || 'pending';

    await sql`
      INSERT INTO daily_posts (id, plan_id, day, type, metadata, status)
      VALUES (${postId}, ${planId}, ${post.day}, ${postType}, ${metadata}::jsonb, ${postStatus})
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        metadata = EXCLUDED.metadata,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `;

    const slides = post.slides || [{ role: 'single', designSpec: post.designSpec, generatedAsset: post.images?.[0] }];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideId = `slide_${postId}_idx${i}`;
      const role = slide.role || 'single';
      const designSpec = JSON.stringify(slide.designSpec || null);
      const generatedAsset = slide.generatedAsset || null;
      const slideStatus = slide.status || 'pending';

      await sql`
        INSERT INTO post_slides (id, post_id, slide_index, role, design_spec, generated_asset, status)
        VALUES (${slideId}, ${postId}, ${i}, ${role}, ${designSpec}::jsonb, ${generatedAsset}, ${slideStatus})
        ON CONFLICT (id) DO UPDATE SET
          design_spec = EXCLUDED.design_spec,
          generated_asset = EXCLUDED.generated_asset,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `;
    }
  }
}

export async function loadPlans() {
  const rows = await sql`
    SELECT p.id, p.month, p.year, p.status, COUNT(dp.id) as post_count
    FROM plans p
    LEFT JOIN daily_posts dp ON p.id = dp.plan_id
    GROUP BY p.id
    ORDER BY p.year DESC, p.month DESC
  `;

  const plans = {};
  for (const row of rows) {
    plans[row.id] = {
      id: row.id,
      month: row.month,
      year: row.year,
      status: row.status,
      post_count: parseInt(row.post_count)
    };
  }
  return plans;
}

export async function loadPlanDetails(planId) {
  const postsRows = await sql`
    SELECT id, day, type, metadata, status FROM daily_posts WHERE plan_id = ${planId} ORDER BY day ASC
  `;

  const posts = [];
  for (const row of postsRows) {
    const slidesRows = await sql`
      SELECT slide_index, role, design_spec, generated_asset, status
      FROM post_slides WHERE post_id = ${row.id} ORDER BY slide_index ASC
    `;

    const slides = slidesRows.map(s => ({
      role: s.role,
      designSpec: s.design_spec,
      generatedAsset: s.generated_asset,
      status: s.status
    }));

    posts.push({
      day: row.day,
      postId: row.id,
      type: row.type,
      status: row.status,
      title: row.metadata?.title || '',
      caption: row.metadata?.caption || '',
      hashtags: row.metadata?.hashtags || [],
      image_prompt: row.metadata?.image_prompt || '',
      slides: slides,
      images: slides.map(s => s.generatedAsset).filter(Boolean)
    });
  }
  return posts;
}

export async function updateSlideDesign(postId, slideIndex, newDesignSpec, newDataUrl) {
  const designSpec = JSON.stringify(newDesignSpec);

  await sql`
    UPDATE post_slides
    SET design_spec = ${designSpec}::jsonb, generated_asset = ${newDataUrl}, status = 'edited', updated_at = CURRENT_TIMESTAMP
    WHERE post_id = ${postId} AND slide_index = ${slideIndex}
  `;

  await sql`
    UPDATE daily_posts SET status = 'edited', updated_at = CURRENT_TIMESTAMP WHERE id = ${postId}
  `;
}

export async function deletePost(postId) {
  await sql`DELETE FROM post_slides WHERE post_id = ${postId}`;
  await sql`DELETE FROM daily_posts WHERE id = ${postId}`;
}

export async function deletePlan(planId) {
  const posts = await sql`SELECT id FROM daily_posts WHERE plan_id = ${planId}`;
  for (const post of posts) {
    await sql`DELETE FROM post_slides WHERE post_id = ${post.id}`;
  }
  await sql`DELETE FROM daily_posts WHERE plan_id = ${planId}`;
  await sql`DELETE FROM plans WHERE id = ${planId}`;
}

export async function loadAllSlidesForPlan(planId) {
  const rows = await sql`
    SELECT 
      ps.id as slide_id,
      ps.post_id,
      ps.slide_index,
      ps.role,
      ps.design_spec,
      ps.generated_asset,
      ps.status,
      dp.day,
      dp.type,
      dp.metadata
    FROM post_slides ps
    JOIN daily_posts dp ON ps.post_id = dp.id
    WHERE dp.plan_id = ${planId}
      AND ps.generated_asset IS NOT NULL
    ORDER BY dp.day ASC, ps.slide_index ASC
  `;
  return rows.map(r => ({
    slideId: r.slide_id,
    postId: r.post_id,
    slideIndex: r.slide_index,
    role: r.role,
    designSpec: r.design_spec,
    generatedAsset: r.generated_asset,
    status: r.status,
    day: r.day,
    type: r.type,
    title: r.metadata?.title || `Day ${r.day}`
  }));
}

export async function loadAllPresets() {
  try {
    const res = await sql`SELECT id, category, name, spec, created_at FROM presets ORDER BY category, created_at DESC`;
    return res.map(row => ({ id: row.id, category: row.category, name: row.name, spec: row.spec, created_at: row.created_at }));
  } catch (err) {
    console.error('[DB] loadAllPresets error:', err);
    return [];
  }
}

export async function deletePreset(id) {
  await sql`DELETE FROM presets WHERE id = ${id}`;
}

export async function savePreset(category, name, spec) {
  await sql`
    INSERT INTO presets (category, name, spec, created_at)
    VALUES (${category}, ${name}, ${JSON.stringify(spec)}::jsonb, NOW())
  `;
}

export async function loadPresetsByCategory(category) {
  try {
    const res = await sql`SELECT id, name, spec FROM presets WHERE category = ${category} ORDER BY created_at DESC`;
    return res.map(row => ({ id: row.id, name: row.name, spec: row.spec }));
  } catch (err) {
    console.error('[DB] loadPresetsByCategory error:', err);
    return [];
  }
}

// ============================================================
// AI IMAGES TABLE FUNCTIONS (for Neon PostgreSQL)
// ============================================================

export async function saveAIImage({ planId, day, slideIndex, type, imageUrl, prompt, aspectRatio, sourceJson }) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  const timestamp = Date.now();
  
  await sql`
    INSERT INTO ai_images (id, "planId", day, "slideIndex", type, "imageUrl", prompt, "aspectRatio", "sourceJson", "createdAt", "updatedAt")
    VALUES (${id}, ${planId}, ${day}, ${slideIndex}, ${type}, ${imageUrl}, ${prompt}, ${aspectRatio}, ${JSON.stringify(sourceJson)}::jsonb, ${timestamp}, ${timestamp})
  `;
  
  return { id, planId, day, slideIndex, type, imageUrl, prompt, aspectRatio, sourceJson, createdAt: timestamp };
}

export async function updateAIImage(id, { imageUrl, prompt, sourceJson }) {
  await sql`
    UPDATE ai_images 
    SET "imageUrl" = ${imageUrl}, 
        prompt = ${prompt}, 
        "sourceJson" = ${sourceJson ? JSON.stringify(sourceJson) : null}::jsonb, 
        "updatedAt" = ${Date.now()}
    WHERE id = ${id}
  `;
}

export async function loadAIImages(planId = null) {
  let rows;
  if (planId) {
    rows = await sql`
      SELECT * FROM ai_images 
      WHERE "planId" = ${planId} 
      ORDER BY day ASC, "slideIndex" ASC, "createdAt" DESC
    `;
  } else {
    rows = await sql`
      SELECT * FROM ai_images 
      ORDER BY day ASC, "slideIndex" ASC, "createdAt" DESC
    `;
  }
  
  return rows.map(row => ({
    id: row.id,
    planId: row.planId,
    day: row.day,
    slideIndex: row.slideIndex,
    type: row.type,
    imageUrl: row.imageUrl,
    prompt: row.prompt,
    aspectRatio: row.aspectRatio,
    sourceJson: row.sourceJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

export async function deleteAIImage(id) {
  await sql`DELETE FROM ai_images WHERE id = ${id}`;
}

export async function deleteAIImagesByPlan(planId) {
  await sql`DELETE FROM ai_images WHERE "planId" = ${planId}`;
}