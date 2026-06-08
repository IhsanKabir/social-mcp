import type {
  SocialAdapter,
  PublishRequest,
  PublishResult,
  Comment,
  Insights,
  AuthContext,
} from '../types.js';
import type { PlatformCapabilities } from '../capabilities.js';
import { capabilitiesFor } from '../capabilities.js';
import { CapabilityError } from '../capability-error.js';
import type { StoredToken } from '../../auth/token-store.js';
import type { OAuthProfile } from '../../auth/profiles/types.js';
import { publishLinkedInPost } from './publish.js';

/**
 * LinkedIn adapter (Share on LinkedIn / w_member_social). Personal member posting only.
 * Engagement and analytics are not exposed by the open-access product, so those methods
 * throw CapabilityError — callers should consult capabilities() first and degrade.
 */
export class LinkedInAdapter implements SocialAdapter {
  readonly platform = 'linkedin' as const;

  capabilities(): PlatformCapabilities {
    return capabilitiesFor('linkedin');
  }

  async publish(req: PublishRequest, auth: AuthContext): Promise<PublishResult> {
    if (req.media && req.media.length > 0) {
      throw new CapabilityError(
        'linkedin',
        'media publishing',
        'text posting is implemented; image/video support is planned for a later phase',
      );
    }
    if (!req.text || req.text.trim().length === 0) {
      throw new Error('A LinkedIn post requires non-empty text.');
    }
    const authorUrn = auth.meta?.authorUrn;
    if (!authorUrn) {
      throw new Error(
        'Missing LinkedIn author URN on the stored token. Re-run `social-mcp auth linkedin`.',
      );
    }
    return publishLinkedInPost({
      text: req.text,
      authorUrn,
      visibility: req.visibility,
      accessToken: auth.accessToken,
    });
  }

  async getComments(_remoteId: string, _auth: AuthContext): Promise<Comment[]> {
    throw new CapabilityError(
      'linkedin',
      'read comments',
      'the open-access Share on LinkedIn product exposes no comment API',
    );
  }

  async getMentions(_accountId: string, _auth: AuthContext): Promise<Comment[]> {
    throw new CapabilityError('linkedin', 'read mentions');
  }

  async reply(_commentId: string, _text: string, _auth: AuthContext): Promise<{ id: string }> {
    throw new CapabilityError('linkedin', 'reply to comments');
  }

  async getInsights(_remoteId: string | null, _auth: AuthContext): Promise<Insights> {
    throw new CapabilityError(
      'linkedin',
      'analytics',
      'not available in the Share on LinkedIn product',
    );
  }

  async refreshAuth(_token: StoredToken, _profile: OAuthProfile): Promise<StoredToken | null> {
    // The open-access tier issues no refresh token; callers mark the account needs_reauth.
    return null;
  }
}
