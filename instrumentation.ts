// Runs once when the Next.js server starts. Starts the daily vacancy-scraping scheduler.
// The Node-only code lives in instrumentation-node.ts and is imported only in the Node.js
// runtime, so the Edge build never sees child_process / fs.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
