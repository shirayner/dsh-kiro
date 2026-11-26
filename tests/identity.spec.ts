import { describe, expect, it, vi } from 'vitest'

/** Kiro's published client-version floor from 2027-01-15. */
const PUBLISHED_FLOOR = '0.12.291'

/** The release the live feed published when the gate was last verified. */
const FEED_RELEASE = '1.5.49'

function semverAtLeast(version: string, floor: string): boolean {
  const a = version.split('.').map(Number)
  const b = floor.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  }
  return true
}

/**
 * The adopted release is process state, so every case starts from a fresh
 * module: tests must not see the version a neighbour adopted.
 */
async function identityModule() {
  vi.resetModules()
  return await import('../src/identity.ts')
}

interface FeedCall {
  url: string
  proxyUrl: string | undefined
  signal: AbortSignal
}

function feedReturning(body: unknown, status = 200) {
  const calls: FeedCall[] = []
  const request = async (url: string, _headers: Record<string, string>, proxyUrl: string | undefined, signal: AbortSignal) => {
    calls.push({ url, proxyUrl, signal })
    return { status, body }
  }
  return { request, calls }
}

describe('Kiro client identity', () => {
  it('names an IDE release, which is what the version gate reads', async () => {
    const identity = await identityModule()
    const userAgent = identity.kiroUserAgent()
    expect(userAgent).toBe(`aws-sdk-js/3.738.0 KiroIDE-${identity.KIRO_IDE_FALLBACK_VERSION}`)
    expect(userAgent).toMatch(/KiroIDE-\d+\.\d+\.\d+$/u)
  })

  it('states a fallback release above the published floor', async () => {
    const { KIRO_IDE_FALLBACK_VERSION } = await identityModule()
    expect(semverAtLeast(KIRO_IDE_FALLBACK_VERSION, PUBLISHED_FLOOR)).toBe(true)
  })

  it('is never the versionless identity the gate refused', async () => {
    const identity = await identityModule()
    expect(identity.kiroUserAgent()).not.toMatch(/KiroIDE$/u)
  })

  it('adopts the release the update feed publishes', async () => {
    const identity = await identityModule()
    const feed = feedReturning({ currentRelease: FEED_RELEASE })
    await identity.refreshKiroIdentity('http://proxy.example:8080', feed.request)
    expect(identity.kiroUserAgent()).toMatch(new RegExp(`KiroIDE-${FEED_RELEASE.replaceAll('.', '\\.')}$`, 'u'))
  })

  it('asks the feed through the configured egress, on a deadline', async () => {
    const identity = await identityModule()
    const feed = feedReturning({ currentRelease: FEED_RELEASE })
    await identity.refreshKiroIdentity('http://proxy.example:8080', feed.request)
    expect(feed.calls).toHaveLength(1)
    expect(feed.calls[0]?.url).toBe(identity.KIRO_IDE_RELEASE_FEED_URL)
    expect(feed.calls[0]?.proxyUrl).toBe('http://proxy.example:8080')
    expect(feed.calls[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('keeps the pinned release when the feed answers with an error', async () => {
    const identity = await identityModule()
    const feed = feedReturning({ currentRelease: FEED_RELEASE }, 503)
    await identity.refreshKiroIdentity(undefined, feed.request)
    expect(identity.kiroUserAgent()).toBe(`aws-sdk-js/3.738.0 KiroIDE-${identity.KIRO_IDE_FALLBACK_VERSION}`)
  })

  it('keeps the pinned release when the feed cannot be reached', async () => {
    const identity = await identityModule()
    const request = async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }
    await identity.refreshKiroIdentity(undefined, request)
    expect(identity.kiroUserAgent()).toBe(`aws-sdk-js/3.738.0 KiroIDE-${identity.KIRO_IDE_FALLBACK_VERSION}`)
  })

  it('ignores anything the feed publishes that is not a plain dotted version', async () => {
    for (const published of ['1.5.49\r\nX-Injected: 1', 'v1.5.49', '', 1.5, null]) {
      const identity = await identityModule()
      const feed = feedReturning({ currentRelease: published })
      await identity.refreshKiroIdentity(undefined, feed.request)
      expect(identity.kiroUserAgent()).toBe(`aws-sdk-js/3.738.0 KiroIDE-${identity.KIRO_IDE_FALLBACK_VERSION}`)
    }
  })
})
