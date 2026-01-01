import pool from './database.js';

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
        temperature: 0.9,
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

async function insertWordPairs(pairs) {
  let inserted = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    for (const [word1, word2] of pairs) {
      if (!word1 || !word2) continue;
      
      // Normalize: lowercase, trim
      const w1 = word1.toString().toLowerCase().trim();
      const w2 = word2.toString().toLowerCase().trim();
      
      if (w1 === w2) continue; // Skip if same word
      
      // Insert in alphabetical order to avoid duplicates like (cat,dog) and (dog,cat)
      const [first, second] = w1 < w2 ? [w1, w2] : [w2, w1];
      
      try {
        const result = await client.query(
          'INSERT INTO word_pairs (word1, word2) VALUES ($1, $2) ON CONFLICT (word1, word2) DO NOTHING RETURNING id',
          [first, second]
        );
        if (result.rowCount > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err) {
        skipped++;
      }
    }
  } finally {
    client.release();
  }

  console.log(`Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  return { inserted, skipped };
}

export async function runGeneration() {
  console.log('\n--- Word Generation Run ---');
  console.log('Time:', new Date().toISOString());
  
  const pairs = await generateWordPairs();
  
  if (pairs.length > 0) {
    const result = await insertWordPairs(pairs);
    const totalCount = await getPairCount();
    console.log(`Total word pairs in database: ${totalCount}`);
    return result;
  }
  
  return { inserted: 0, skipped: 0 };
}

// Get a random word pair from the database
export async function getRandomPair() {
  try {
    const result = await pool.query(
      'SELECT word1, word2 FROM word_pairs ORDER BY RANDOM() LIMIT 1'
    );
    
    if (result.rows.length > 0) {
      const pair = result.rows[0];
      // Randomly decide which word goes to civilian vs undercover
      if (Math.random() > 0.5) {
        return { civilianWord: pair.word1, undercoverWord: pair.word2 };
      } else {
        return { civilianWord: pair.word2, undercoverWord: pair.word1 };
      }
    }
  } catch (error) {
    console.error('Error getting random pair:', error.message);
  }
  
  return null;
}

// Get total count
export async function getPairCount() {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM word_pairs');
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('Error getting pair count:', error.message);
    return 0;
  }
}

// List all pairs (for debugging)
export async function getAllPairs() {
  try {
    const result = await pool.query('SELECT * FROM word_pairs ORDER BY created_at DESC');
    return result.rows;
  } catch (error) {
    console.error('Error getting all pairs:', error.message);
    return [];
  }
}
