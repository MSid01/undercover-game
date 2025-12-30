import cron from 'node-cron';
import { runGeneration, getPairCount } from './word-generator.js';

// Groq free tier limits:
// - 30 requests per minute
// - 14,400 requests per day
// 
// We generate 25 pairs per request.
// Running every 5 minutes = 12 requests/hour = 288 requests/day
// This gives us ~7,200 new pairs per day (minus duplicates)

const CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes

let isRunning = false;
let cronTask = null;

export function startCron() {
  // Check if cron is disabled via environment variable
  if (process.env.DISABLE_WORD_CRON === 'true') {
    console.log('⏸️  Word generation cron is DISABLED (DISABLE_WORD_CRON=true)');
    return;
  }

  console.log('Starting word generation cron job...');
  console.log(`Schedule: ${CRON_SCHEDULE} (every 5 minutes)`);
  console.log(`Current pairs in database: ${getPairCount()}`);

  // Run immediately on start
  runGenerationSafe();

  // Schedule periodic runs
  cronTask = cron.schedule(CRON_SCHEDULE, () => {
    runGenerationSafe();
  });

  console.log('Cron job started! (Set DISABLE_WORD_CRON=true to disable)');
}

export function stopCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('⏹️  Cron job stopped');
    return true;
  }
  return false;
}

async function runGenerationSafe() {
  // Prevent overlapping runs
  if (isRunning) {
    console.log('Previous generation still running, skipping...');
    return;
  }

  isRunning = true;
  try {
    await runGeneration();
  } catch (error) {
    console.error('Generation error:', error);
  } finally {
    isRunning = false;
  }
}

// Allow running standalone
if (process.argv[1].includes('cron.js')) {
  startCron();
}

