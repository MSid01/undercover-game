import db from './database.js';

// GROQ_API_KEY should be set in .env and loaded before importing this module
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq free tier: 30 requests/minute, 14,400/day
// Generate 25 pairs per request to be efficient
const PAIRS_PER_REQUEST = 25;

const GENERATION_PROMPT = `Generate ${PAIRS_PER_REQUEST} word pairs for the "Undercover" word game.

Rules:
- Each pair should be two related but distinct words/concepts
- They should be similar enough to confuse, but different enough to identify
- Examples: (Cat, Dog), (Pizza, Burger), (Netflix, YouTube), (Tokyo, Seoul), (Guitar, Violin)
- Mix categories: animals, food, places, brands, activities, objects, etc.
- Words should be common and known to most people
- Avoid obscure or technical terms

Return ONLY a JSON array, no explanation:
[["word1", "word2"], ["word3", "word4"], ...]`;

async function generateWordPairs() {
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY not set in environment');
    return [];
  }

  try {
    console.log('Calling Groq API to generate word pairs...');
    
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: GENERATION_PROMPT
          }
        ],
        temperature: 0.9, // Higher for variety
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Groq API error:', response.status, error);
      return [];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      console.error('No content in Groq response');
      return [];
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response:', content);
      return [];
    }

    const pairs = JSON.parse(jsonMatch[0]);
    console.log(`Parsed ${pairs.length} word pairs from Groq`);
    return pairs;

  } catch (error) {
    console.error('Error generating word pairs:', error.message);
    return [];
  }
}

function insertWordPairs(pairs) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO word_pairs (word1, word2) VALUES (?, ?)
  `);

  let inserted = 0;
  let skipped = 0;

  for (const [word1, word2] of pairs) {
    if (!word1 || !word2) continue;
    
    // Normalize: lowercase, trim
    const w1 = word1.toString().toLowerCase().trim();
    const w2 = word2.toString().toLowerCase().trim();
    
    if (w1 === w2) continue; // Skip if same word
    
    // Insert in alphabetical order to avoid duplicates like (cat,dog) and (dog,cat)
    const [first, second] = w1 < w2 ? [w1, w2] : [w2, w1];
    
    const result = insertStmt.run(first, second);
    if (result.changes > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  return { inserted, skipped };
}

export async function runGeneration() {
  console.log('\n--- Word Generation Run ---');
  console.log('Time:', new Date().toISOString());
  
  const pairs = await generateWordPairs();
  
  if (pairs.length > 0) {
    const result = insertWordPairs(pairs);
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM word_pairs').get();
    console.log(`Total word pairs in database: ${totalCount.count}`);
    return result;
  }
  
  return { inserted: 0, skipped: 0 };
}

// Get a random word pair from the database
export function getRandomPair() {
  const pair = db.prepare(`
    SELECT word1, word2 FROM word_pairs ORDER BY RANDOM() LIMIT 1
  `).get();
  
  if (pair) {
    // Randomly decide which word goes to civilian vs undercover
    if (Math.random() > 0.5) {
      return { civilianWord: pair.word1, undercoverWord: pair.word2 };
    } else {
      return { civilianWord: pair.word2, undercoverWord: pair.word1 };
    }
  }
  
  return null;
}

// Get total count
export function getPairCount() {
  const result = db.prepare('SELECT COUNT(*) as count FROM word_pairs').get();
  return result.count;
}

// List all pairs (for debugging)
export function getAllPairs() {
  return db.prepare('SELECT * FROM word_pairs ORDER BY created_at DESC').all();
}

