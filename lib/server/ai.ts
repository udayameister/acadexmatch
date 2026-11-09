/*
 * Server-side client for Anthropic's Claude API (the same key the help assistant uses).
 * Two roles, each with its own model: a fast "interviewer" for the chat and the resume writer, and a
 * separate, stronger "improver" that rewrites the resume for ATS. Models can be changed with env vars.
 */
import type { PlanSettings } from '@/types';

export const AI_MODELS = {
  chat: () => process.env.AI_RESUME_CHAT_MODEL || 'claude-haiku-5-5',
  writer: () => process.env.AI_RESUME_WRITER_MODEL || 'claude-sonnet-5-5',
  improver: () => process.env.AI_RESUME_IMPROVE_MODEL || 'claude-opus-5-5',
};

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.AI_RESUME !== 'off';
}
/** True when candidates may buy and use the AI resume builder. */
export function aiResumeAvailable(s: Partial<PlanSettings>): boolean {
  return aiConfigured() && s.aiResumeEnabled !== false;
}

export interface AiMessage { role: 'user' | 'assistant'; content: string }
export interface AiTool { name: string; description: string; input_schema: Record<string, unknown> }
export interface AiResult { text: string; tool?: { name: string; input: unknown }; usage: { input: number; output: number }; model: string }

export class AiError extends Error { constructor(message: string, public status = 502) { super(message); } }

/** One call to the Messages API. With `tool`, the model must answer by calling that tool (structured output). */
export async function callClaude(opts: { model: string; system: string; messages: AiMessage[]; maxTokens: number; tool?: AiTool; timeoutMs?: number }): Promise<AiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError('The AI service is not configured.', 503);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const r = await fetch(`${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: opts.model, max_tokens: opts.maxTokens, system: opts.system, messages: opts.messages,
        ...(opts.tool ? { tools: [opts.tool], tool_choice: { type: 'tool', name: opts.tool.name } } : {}),
      }),
    });
    const d = await r.json().catch(() => ({})) as { content?: { type: string; text?: string; name?: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string }; model?: string };
    if (!r.ok) {
      console.error('[AcadeXMatch] AI request failed', r.status, d?.error?.message);
      throw new AiError(r.status === 429 || r.status === 529 ? 'The AI service is busy. Please try again in a minute.' : 'The AI service could not answer. Please try again.', r.status === 429 || r.status === 529 ? 503 : 502);
    }
    const blocks = d.content || [];
    const tool = blocks.find(b => b.type === 'tool_use');
    return {
      text: blocks.filter(b => b.type === 'text').map(b => b.text || '').join('').trim(),
      tool: tool ? { name: tool.name || '', input: tool.input } : undefined,
      usage: { input: d.usage?.input_tokens || 0, output: d.usage?.output_tokens || 0 },
      model: d.model || opts.model,
    };
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError((e as Error).name === 'AbortError' ? 'The AI service took too long. Please try again.' : 'Could not reach the AI service. Please try again.');
  } finally { clearTimeout(t); }
}
