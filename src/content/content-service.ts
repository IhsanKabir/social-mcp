import { isPlatformId } from '../platform/ids.js';
import { capabilitiesFor } from '../adapters/capabilities.js';

/**
 * Generates text by delegating to an injected sampler. Interactively, the sampler is backed
 * by the MCP host's own model (free, no API key). For the unattended daemon a direct-provider
 * sampler can be supplied (Phase 8). Content logic stays provider-agnostic.
 */
export type Sampler = (opts: {
  prompt: string;
  system?: string;
  maxTokens?: number;
}) => Promise<string>;

export interface GeneratePostParams {
  platform: string;
  topic: string;
  tone?: string;
  maxLength?: number;
  sampler: Sampler;
}

export async function generatePostText(params: GeneratePostParams): Promise<string> {
  const caps = isPlatformId(params.platform) ? capabilitiesFor(params.platform) : null;
  const platformName = caps?.displayName ?? params.platform;
  const limit = params.maxLength ?? caps?.publish.maxTextLength;

  const system = [
    `You are an expert social media copywriter. Write ONE ${platformName} post.`,
    limit ? `Keep it under ${limit} characters.` : '',
    params.tone ? `Tone: ${params.tone}.` : '',
    'Return ONLY the post text — no preamble, no surrounding quotes, no explanations.',
  ]
    .filter(Boolean)
    .join(' ');

  const prompt = `Write a ${platformName} post about: ${params.topic}`;

  let text = (await params.sampler({ prompt, system, maxTokens: 800 })).trim();
  // Strip wrapping quotes the model sometimes adds.
  text = text.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (limit && text.length > limit) text = text.slice(0, limit).trim();
  return text;
}

export interface GenerateReplyParams {
  platform: string;
  commentText: string;
  tone?: string;
  sampler: Sampler;
}

/** Draft a reply to a comment. Never sends — the caller decides whether to post it. */
export async function generateReplyText(params: GenerateReplyParams): Promise<string> {
  const system = [
    'You write friendly, concise replies to social media comments as the account owner.',
    params.tone ? `Tone: ${params.tone}.` : '',
    'Return ONLY the reply text — no preamble, no quotes.',
  ]
    .filter(Boolean)
    .join(' ');
  const prompt = `Reply to this ${params.platform} comment: "${params.commentText}"`;
  const text = (await params.sampler({ prompt, system, maxTokens: 300 })).trim();
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}
