/**
 * The client identity every Kiro request presents.
 *
 * Kiro authorizes by client identity rather than by token alone, and since
 * 2026-11-09 its client-version gate refuses any `user-agent` that names no
 * IDE release, answering even `generateAssistantResponse` with HTTP 400
 * "This version of Kiro is no longer supported. Please update to the latest
 * version of Kiro to continue." The versionless `aws-sdk-js/3.738.0 KiroIDE`
 * identity this provider used to send was such a request: every turn failed
 * while the same token kept working from the installed IDE.
 *
 * Naming a release is therefore required, not cosmetic, and the release has to
 * stay above Kiro's floor — 0.12.291 from 2027-01-15 — which moves without
 * notice. Rather than pinning a number that ages into another outage, the
 * provider adopts the release Kiro's own IDE updater currently publishes, and
 * falls back to `KIRO_IDE_FALLBACK_VERSION` only when that feed cannot be read.
 *
 * Verified against the live service on 2026-11-26: the versionless identity
 * returned the error above, `KiroIDE-1.4.178` returned a normal assistant
 * stream, and the feed published `1.5.49`.
 */
import { getJson } from './transport.ts';
/** Kiro IDE release presented when the update feed cannot be read. */
export declare const KIRO_IDE_FALLBACK_VERSION = "1.4.178";
/**
 * The feed Kiro's IDE updater polls to notice a new release.
 *
 * Undocumented, and the windows build answers 403 here, so every platform
 * reads the darwin one: only `currentRelease` is used, and that field is not
 * platform-specific.
 */
export declare const KIRO_IDE_RELEASE_FEED_URL = "https://prod.download.desktop.kiro.dev/stable/metadata-darwin-arm64-stable.json";
/** User agent shared by inference, model discovery, usage and API-key checks. */
export declare function kiroUserAgent(): string;
/** Release feed reader, injectable so tests never reach the network. */
export type ReleaseFeedRequest = typeof getJson;
/**
 * Adopt the IDE release the update feed currently publishes.
 *
 * Failures are swallowed on purpose: the pinned fallback is a working identity,
 * so an unreachable feed costs nothing today. Requests made before the feed
 * answers present the fallback.
 * @param proxyUrl - egress the feed request must share with Kiro traffic.
 * @param request - feed reader, `getJson` unless a test says otherwise.
 */
export declare function refreshKiroIdentity(proxyUrl: string | undefined, request?: ReleaseFeedRequest): Promise<void>;
