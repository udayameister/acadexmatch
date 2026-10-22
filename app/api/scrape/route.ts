import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { ScrapeEngineResult, isPrivateHost, transformRawToJob } from '@/lib/server/scrapeEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetUrl = (body.url || '').trim();

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, error: 'University URL is required.' },
        { status: 400 }
      );
    }

    // Basic URL validation
    let validUrl: URL;
    try {
      validUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL provided.' },
        { status: 400 }
      );
    }

    if (!['http:', 'https:'].includes(validUrl.protocol) || isPrivateHost(validUrl.hostname)) {
      return NextResponse.json(
        { success: false, error: 'Only public university websites can be scraped.' },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scraper.py');

    // Run python scraper with --json-only flag
    const pythonBin = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    const pythonProcess = spawn(pythonBin, [scriptPath, validUrl.toString(), '--json-only'], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdoutData = '';
    let stderrData = '';

    const runPromise = new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        // 60-second execution timeout
        const timer = setTimeout(() => {
          pythonProcess.kill();
          resolve({ code: -2, stdout: stdoutData, stderr: 'Execution timed out after 60 seconds.' });
        }, 60000);

        pythonProcess.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString('utf-8');
        });

        pythonProcess.stderr.on('data', (chunk) => {
          stderrData += chunk.toString('utf-8');
        });

        pythonProcess.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout: stdoutData, stderr: stderrData });
        });

        pythonProcess.on('error', (err) => {
          clearTimeout(timer);
          resolve({ code: -1, stdout: stdoutData, stderr: `Could not start Python (${err.message}). Install Python 3.10+ or set PYTHON_BIN.` });
        });
      }
    );

    const { code, stdout, stderr } = await runPromise;

    if (code !== 0) {
      console.error('[Scraper API] Python execution failed:', stderr);
      return NextResponse.json(
        {
          success: false,
          error: `Scraping failed: ${stderr || 'Process returned non-zero code.'}`,
        },
        { status: 500 }
      );
    }

    // Find JSON block in stdout
    let parsed: ScrapeEngineResult;
    try {
      // Find where JSON begins
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON output found in scraper response.');
      }
      const rawJson = stdout.slice(jsonStart, jsonEnd + 1);
      parsed = JSON.parse(rawJson);
    } catch (parseError: any) {
      console.error('[Scraper API] JSON parse error:', parseError, stdout);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse JSON from Python scraper engine.',
          rawOutput: stdout,
        },
        { status: 500 }
      );
    }

    const domain = validUrl.hostname.replace('www.', '');
    const mappedJobs = (parsed.openings || []).map((opening, idx) =>
      transformRawToJob(opening, idx, parsed.institution_title, domain)
    );

    return NextResponse.json({
      success: true,
      telemetry: {
        institutionTitle: parsed.institution_title,
        seedUrl: parsed.start_url,
        pagesCrawled: parsed.pages_crawled,
        careerHubsDiscovered: parsed.career_hubs_discovered || [],
        totalFacultyFound: mappedJobs.length,
      },
      openings: parsed.openings,
      jobs: mappedJobs,
    });
  } catch (err: any) {
    console.error('[Scraper API Route] Internal error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
