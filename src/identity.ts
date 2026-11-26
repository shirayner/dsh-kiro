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

import { getJson } from './transport.ts'

/** Kiro IDE release presented when the update feed cannot be read. */
export const KIRO_IDE_FALLBACK_VERSION = '1.4.178'

/**
 * The feed Kiro's IDE updater polls to notice a new release.
 *
 * Undocumented, and the windows build answers 403 here, so every platform
 * reads the darwin one: only `currentRelease` is used, and that field is not
 * platform-specific.
 */
export const KIRO_IDE_RELEASE_FEED_URL = 'https://prod.download.desktop.kiro.dev/stable/metadata-darwin-arm64-stable.json'

/**
 * A plain dotted version. The value is written into a request header, so
 * anything else the feed might publish has to be ignored rather than trusted.
 */
const VERSION_PATTERN = /^\d+(\.\d+){1,3}$/u

const RELEASE_FEED_TIMEOUT_MS = 5_000

let ideVersion = KIRO_IDE_FALLBACK_VERSION

/** User agent shared by inference, model discovery, usage and API-key checks. */
export function kiroUserAgent(): string {
  return `aws-sdk-js/3.738.0 KiroIDE-${ideVersion}`
}

/** Release feed reader, injectable so tests never reach the network. */
export type ReleaseFeedRequest = typeof getJson

/**
 * Adopt the IDE release the update feed currently publishes.
 *
 * Failures are swallowed on purpose: the pinned fallback is a working identity,
 * so an unreachable feed costs nothing today. Requests made before the feed
 * answers present the fallback.
 * @param proxyUrl - egress the feed request must share with Kiro traffic.
 * @param request - feed reader, `getJson` unless a test says otherwise.
 */
export async function refreshKiroIdentity(
  proxyUrl: string | undefined,
  request: ReleaseFeedRequest = getJson,
): Promise<void> {
  try {
    const { status, body } = await request(
      KIRO_IDE_RELEASE_FEED_URL,
      {},
      proxyUrl,
      AbortSignal.timeout(RELEASE_FEED_TIMEOUT_MS),
    )
    if (status !== 200) return
    const release = publishedVersion(body)
    if (release !== undefined) ideVersion = release
  } catch {
    // Keep the fallback: the gate fails on a stale pin, which is a version
    // bump, not something a retry loop here can fix.
  }
}

function publishedVersion(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const release = (body as { currentRelease?: unknown }).currentRelease
  return typeof release === 'string' && VERSION_PATTERN.test(release) ? release : undefined
}
