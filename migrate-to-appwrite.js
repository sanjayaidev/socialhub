// migrate-to-appwrite.js
// Node.js script to set up Appwrite database and migrate data
// Run with: node migrate-to-appwrite.js
//
// Required environment variables:
//   APPWRITE_ENDPOINT    e.g. https://cloud.appwrite.io/v1
//   APPWRITE_PROJECT_ID  your Appwrite project ID
//   APPWRITE_API_KEY     your Appwrite API key (with database/admin permissions)
//
// Optional:
//   TURSO_DATABASE_URL   If set, will migrate data from Turso to Appwrite
//   TURSO_AUTH_TOKEN     Turso authentication token

import fetch from 'node-fetch';

const config = {
    endpoint: process.env.APPWRITE_ENDPOINT?.replace(/\/$/, ''),
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY,
    databaseId: process.env.APPWRITE_DATABASE_ID || 'content_planner_db',
    collectionId: 'content_items',
    tursoUrl: process.env.TURSO_DATABASE_URL,
    tursoToken: process.env.TURSO_AUTH_TOKEN,
};

// Validate required config
if (!config.endpoint || !config.projectId || !config.apiKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY');
    process.exit(1);
}

// Appwrite API helper
async function appwriteRequest(path, options = {}) {
    const url = `${config.endpoint}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': config.projectId,
        'Authorization': `Bearer ${config.apiKey}`,
        ...options.headers,
    };

    console.log(`→ ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Appwrite API error ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
}

// Step 1: Create Database
async function createDatabase() {
    console.log('\n📦 Step 1: Creating database...');
    
    try {
        // Check if database already exists
        const existing = await appwriteRequest(`/databases/${config.databaseId}`);
        console.log(`✓ Database "${config.databaseId}" already exists`);
        return existing;
    } catch (err) {
        if (err.message.includes('404')) {
            // Database doesn't exist, create it
            const database = await appwriteRequest('/databases', {
                method: 'POST',
                body: JSON.stringify({
                    databaseId: config.databaseId,
                    name: 'Content Planner Database',
                }),
            });
            console.log(`✓ Database "${config.databaseId}" created successfully`);
            return database;
        }
        throw err;
    }
}

// Step 2: Create Collection
async function createCollection() {
    console.log('\n📋 Step 2: Creating collection...');
    
    try {
        // Check if collection already exists
        const existing = await appwriteRequest(
            `/databases/${config.databaseId}/collections/${config.collectionId}`
        );
        console.log(`✓ Collection "${config.collectionId}" already exists`);
        return existing;
    } catch (err) {
        if (err.message.includes('404')) {
            // Collection doesn't exist, create it
            const collection = await appwriteRequest(
                `/databases/${config.databaseId}/collections`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        collectionId: config.collectionId,
                        databaseId: config.databaseId,
                        name: 'Content Items',
                        permissions: [],
                        documentPermissions: [],
                        attributePermissions: [],
                    }),
                }
            );
            console.log(`✓ Collection "${config.collectionId}" created successfully`);
            
            // Now create attributes
            await createCollectionAttributes();
            
            return collection;
        }
        throw err;
    }
}

// Step 3: Create Collection Attributes
async function createCollectionAttributes() {
    console.log('\n🔧 Step 3: Creating collection attributes...');
    
    const attributes = [
        { key: 'day', type: 'integer', required: true, array: false },
        { key: 'audience', type: 'string', required: false, array: false, size: 255 },
        { key: 'raw', type: 'string', required: true, array: false, size: 65536 },
        { key: 'refined', type: 'string', required: false, array: false, size: 65536 },
        { key: 'platforms', type: 'string', required: false, array: false, size: 65536 },
        { key: 'hook', type: 'string', required: false, array: false, size: 65536 },
        { key: 'description', type: 'string', required: false, array: false, size: 65536 },
        { key: 'cta', type: 'string', required: false, array: false, size: 65536 },
        { key: 'hashtags', type: 'string', required: false, array: false, size: 65536 },
        { key: 'design_spec', type: 'string', required: false, array: false, size: 65536 },
        { key: 'design_image', type: 'string', required: false, array: false, size: 65536 },
    ];

    for (const attr of attributes) {
        try {
            await appwriteRequest(
                `/databases/${config.databaseId}/collections/${config.collectionId}/attributes/${attr.type}`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        key: attr.key,
                        required: attr.required,
                        array: attr.array,
                        ...(attr.type === 'string' && { size: attr.size }),
                    }),
                }
            );
            console.log(`  ✓ Attribute "${attr.key}" (${attr.type}) created`);
        } catch (err) {
            if (err.message.includes('already exists')) {
                console.log(`  ✓ Attribute "${attr.key}" already exists`);
            } else {
                console.warn(`  ⚠ Could not create attribute "${attr.key}": ${err.message}`);
            }
        }
    }
}

// Step 4: Create Index on 'day' field
async function createIndex() {
    console.log('\n📇 Step 4: Creating index on "day" field...');
    
    try {
        const index = await appwriteRequest(
            `/databases/${config.databaseId}/collections/${config.collectionId}/indexes`,
            {
                method: 'POST',
                body: JSON.stringify({
                    indexId: 'day_index',
                    type: 'key',
                    attributes: ['day'],
                    orders: ['ASC'],
                }),
            }
        );
        console.log('✓ Index "day_index" created successfully');
        return index;
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('✓ Index "day_index" already exists');
        } else {
            console.warn(`⚠ Could not create index: ${err.message}`);
        }
    }
}

// Step 5: Migrate data from Turso (if available)
async function migrateFromTurso() {
    if (!config.tursoUrl || !config.tursoToken) {
        console.log('\n⏭️  Skipping Turso migration (TURSO_DATABASE_URL not set)');
        return [];
    }

    console.log('\n🔄 Step 5: Migrating data from Turso...');
    
    // Import libsql for Turso connection
    const { createClient } = await import('@libsql/client');
    
    const tursoClient = createClient({
        url: config.tursoUrl,
        authToken: config.tursoToken,
    });

    try {
        // Fetch all data from Turso
        const result = await tursoClient.execute('SELECT * FROM content_items ORDER BY day');
        const rows = result.rows;
        
        console.log(`  Found ${rows.length} items in Turso`);
        
        if (rows.length === 0) {
            console.log('  No data to migrate');
            return [];
        }

        // Insert each row into Appwrite
        let migrated = 0;
        for (const row of rows) {
            try {
                await appwriteRequest(
                    `/databases/${config.databaseId}/collections/${config.collectionId}/documents`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            documentId: `day_${row.day}`,
                            day: row.day,
                            audience: row.audience || '',
                            raw: row.raw,
                            refined: row.refined || '',
                            platforms: JSON.stringify(row.platforms ? JSON.parse(row.platforms) : []),
                            hook: row.hook || '',
                            description: row.description || '',
                            cta: row.cta || '',
                            hashtags: row.hashtags || '',
                            design_spec: row.design_spec ? JSON.stringify(row.design_spec) : null,
                            design_image: row.design_image || null,
                        }),
                    }
                );
                migrated++;
                console.log(`  ✓ Migrated day ${row.day}`);
            } catch (err) {
                console.warn(`  ⚠ Failed to migrate day ${row.day}: ${err.message}`);
            }
        }

        console.log(`\n✓ Migration complete: ${migrated}/${rows.length} items migrated`);
        return rows;
    } catch (err) {
        console.error(`❌ Turso migration failed: ${err.message}`);
        return [];
    } finally {
        tursoClient.close();
    }
}

// Step 6: Seed with sample data (if no migration)
async function seedSampleData() {
    console.log('\n🌱 Step 6: Seeding sample data...');
    
    const sampleData = [
        {
            day: 1,
            audience: 'clients',
            raw: 'Introduce yourself and your services',
            refined: 'Hi! I\'m [Your Name], and I help businesses grow through strategic content marketing.',
            platforms: ['Instagram', 'LinkedIn'],
            hook: 'Day 1: Let\'s start this journey together! 🚀',
            description: 'A warm introduction post to kick off the 31-day content challenge.',
            cta: 'Follow along for daily content tips!',
            hashtags: '#ContentCreator #Day1 #31DayChallenge',
        },
        {
            day: 2,
            audience: 'students',
            raw: 'Share a quick tip about content planning',
            refined: 'Pro tip: Batch your content creation! Spend 2 hours on Sunday creating posts for the entire week.',
            platforms: ['Instagram', 'TikTok'],
            hook: 'Save 10+ hours per week with this one trick ⏰',
            description: 'Teach your audience about efficient content planning strategies.',
            cta: 'Try batch creating this week and let me know how it goes!',
            hashtags: '#ContentTips #ProductivityHack #ContentPlanning',
        },
        {
            day: 3,
            audience: 'clients',
            raw: 'Showcase a client success story',
            refined: 'Case Study: How we helped @ClientName increase their engagement by 300% in 30 days.',
            platforms: ['LinkedIn', 'Instagram'],
            hook: 'From 0 to hero: A 300% engagement boost 📈',
            description: 'Share real results to build credibility and trust with potential clients.',
            cta: 'DM me if you want similar results for your brand!',
            hashtags: '#CaseStudy #ClientSuccess #ContentMarketing',
        },
    ];

    let seeded = 0;
    for (const item of sampleData) {
        try {
            await appwriteRequest(
                `/databases/${config.databaseId}/collections/${config.collectionId}/documents`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        documentId: `day_${item.day}`,
                        ...item,
                        platforms: JSON.stringify(item.platforms),
                        design_spec: null,
                        design_image: null,
                    }),
                }
            );
            seeded++;
            console.log(`  ✓ Seeded day ${item.day}`);
        } catch (err) {
            if (err.message.includes('already exists')) {
                console.log(`  ✓ Day ${item.day} already exists`);
            } else {
                console.warn(`  ⚠ Failed to seed day ${item.day}: ${err.message}`);
            }
        }
    }

    console.log(`\n✓ Seeding complete: ${seeded} sample items added`);
}

// Main execution
async function main() {
    console.log('🚀 Starting Appwrite Setup & Migration\n');
    console.log(`Endpoint: ${config.endpoint}`);
    console.log(`Project: ${config.projectId}`);
    console.log(`Database: ${config.databaseId}`);
    console.log(`Collection: ${config.collectionId}`);

    try {
        // Setup infrastructure
        await createDatabase();
        await createCollection();
        await createIndex();

        // Try to migrate from Turso, otherwise seed sample data
        const migrated = await migrateFromTurso();
        if (migrated.length === 0) {
            await seedSampleData();
        }

        console.log('\n✅ Setup complete! Your Appwrite database is ready.');
        console.log('\n📝 Next steps:');
        console.log('   1. Set these environment variables in Vercel:');
        console.log(`      APPWRITE_ENDPOINT=${config.endpoint}`);
        console.log(`      APPWRITE_PROJECT_ID=${config.projectId}`);
        console.log(`      APPWRITE_DATABASE_ID=${config.databaseId}`);
        console.log(`      APPWRITE_COLLECTION_ID=${config.collectionId}`);
        console.log('      APPWRITE_API_KEY=<your-api-key>');
        console.log('   2. Deploy your application');
        console.log('   3. Open planner.html to start using your content planner!');
        
    } catch (err) {
        console.error('\n❌ Setup failed:', err.message);
        process.exit(1);
    }
}

main();
