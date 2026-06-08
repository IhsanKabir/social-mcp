import { request } from '../../platform/http/client.js';
import type { PublishResult } from '../types.js';
import type { Visibility } from '../capabilities.js';

/**
 * LinkedIn versioned Posts API (the current standard, replacing the legacy /v2/ugcPosts).
 * Requires the LinkedIn-Version header (YYYYMM) and the Rest.li 2.0 protocol header.
 * The created post's URN is returned in the `x-restli-id` response header.
 */
export const LINKEDIN_API_BASE = 'https://api.linkedin.com';
export const LINKEDIN_VERSION = '202401';

function mapVisibility(v?: Visibility): 'PUBLIC' | 'CONNECTIONS' {
  return v === 'connections' ? 'CONNECTIONS' : 'PUBLIC';
}

export interface LinkedInPublishOptions {
  text: string;
  authorUrn: string;
  accessToken: string;
  visibility?: Visibility;
  /** Override the API base (used by tests to target a stub server). */
  baseUrl?: string;
}

export async function publishLinkedInPost(opts: LinkedInPublishOptions): Promise<PublishResult> {
  const url = `${opts.baseUrl ?? LINKEDIN_API_BASE}/rest/posts`;
  const res = await request(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      'content-type': 'application/json',
      'x-restli-protocol-version': '2.0.0',
      'linkedin-version': LINKEDIN_VERSION,
    },
    json: {
      author: opts.authorUrn,
      commentary: opts.text,
      visibility: mapVisibility(opts.visibility),
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  });

  const remoteId = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id') ?? '';
  return {
    platform: 'linkedin',
    remoteId,
    url: remoteId ? `https://www.linkedin.com/feed/update/${remoteId}` : undefined,
    state: 'published',
  };
}
