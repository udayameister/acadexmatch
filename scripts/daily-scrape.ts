/**
 * Runs the vacancy scrape once from the command line (for Windows Task Scheduler / cron),
 * e.g.  npm run scrape:daily
 * New vacancies go to the admin approval queue in data/scrape-pipeline.json.
 */
import { runPipeline } from '../lib/server/scrapeQueue';

runPipeline('command')
  .then(run => {
    console.log(`Scrape finished: ${run.newItems} new vacancies from ${run.sources} sources (${run.errors} errors).`);
    process.exit(run.errors && !run.newItems && run.sources === run.errors ? 1 : 0);
  })
  .catch(err => {
    console.error('Scrape failed:', err);
    process.exit(1);
  });
