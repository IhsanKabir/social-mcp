import { requestJson } from '../../platform/http/client.js';
import { HttpError } from '../../platform/http/errors.js';
import { X_API_BASE } from '../../auth/profiles/x.js';
import type { Insights } from '../types.js';

interface TweetMetricsPayload {
  data?: {
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      quote_count?: number;
      bookmark_count?: number;
      impression_count?: number;
    };
    non_public_metrics?: {
      impression_count?: number;
      url_link_clicks?: number;
      user_profile_clicks?: number;
    };
    organic_metrics?: {
      impression_count?: number;
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
    };
  };
}

interface UserMetricsPayload {
  data?: {
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
      like_count?: number;
    };
  };
}

export async function getXInsights(
  tweetId: string | null,
  userId: string,
  accessToken: string,
  baseUrl: string = X_API_BASE,
): Promise<Insights> {
  if (tweetId) {
    let res: TweetMetricsPayload;
    try {
      res = await requestJson<TweetMetricsPayload>(
        `${baseUrl}/tweets/${tweetId}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 403)) {
        res = await requestJson<TweetMetricsPayload>(
          `${baseUrl}/tweets/${tweetId}?tweet.fields=public_metrics`,
          { headers: { authorization: `Bearer ${accessToken}` } },
        );
      } else {
        throw e;
      }
    }

    const pub = res.data?.public_metrics ?? {};
    const nonPub = res.data?.non_public_metrics ?? {};
    const org = res.data?.organic_metrics ?? {};
    const metrics: Record<string, number> = {
      likes: pub.like_count ?? org.like_count ?? 0,
      replies: pub.reply_count ?? org.reply_count ?? 0,
      reposts: pub.retweet_count ?? org.retweet_count ?? 0,
      quotes: pub.quote_count ?? 0,
      bookmarks: pub.bookmark_count ?? 0,
      impressions: nonPub.impression_count ?? org.impression_count ?? pub.impression_count ?? 0,
    };
    if (typeof nonPub.url_link_clicks === 'number') metrics.urlClicks = nonPub.url_link_clicks;
    if (typeof nonPub.user_profile_clicks === 'number') metrics.profileClicks = nonPub.user_profile_clicks;

    return { remoteId: tweetId, metrics, pulledAt: new Date() };
  }

  const res = await requestJson<UserMetricsPayload>(
    `${baseUrl}/users/${userId}?user.fields=public_metrics`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const pub = res.data?.public_metrics ?? {};
  return {
    metrics: {
      followers: pub.followers_count ?? 0,
      following: pub.following_count ?? 0,
      tweets: pub.tweet_count ?? 0,
      listed: pub.listed_count ?? 0,
      likes: pub.like_count ?? 0,
    },
    pulledAt: new Date(),
  };
}
