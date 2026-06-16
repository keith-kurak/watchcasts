// Domain model shared across the phone app (and any future web client).
// NOTE: the Wear OS app is Kotlin and cannot import this file. The watch
// mirrors the relevant shapes in Kotlin data classes. Treat this as the
// canonical definition and keep the Kotlin side in step.

export interface Subscription {
  /** Stable id — use the feed URL hashed, or the feed's GUID if present. */
  id: string;
  feedUrl: string;
  title: string;
  author?: string;
  imageUrl?: string;
  /** When the user subscribed, epoch ms. */
  subscribedAt: number;
}

export interface Episode {
  id: string;
  subscriptionId: string;
  title: string;
  audioUrl: string;
  durationSeconds?: number;
  publishedAt: number;
  /** Local download state, tracked independently on phone vs watch. */
  downloadState: "none" | "queued" | "downloading" | "downloaded" | "failed";
}
