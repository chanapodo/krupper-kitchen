import { afterEach, describe, expect, it, vi } from 'vitest';

// Real-mode AI calls with a fake Firebase AI SDK: which models and tools are used, and what the family sees.
const calls: { model: string; tools: unknown[] }[] = [];
let answer: (model: string, signal?: AbortSignal) => Promise<unknown>;

vi.mock('../src/config', () => ({ FIREBASE: { apiKey: 'x' }, FAMILY_ID: 'test' }));
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('firebase/ai', () => ({
  getAI: () => ({}),
  GoogleAIBackend: class {},
  getGenerativeModel: (_: unknown, p: { model: string; tools: unknown[] }) => ({
    generateContent: (_parts: unknown, o?: { signal?: AbortSignal }) => {
      calls.push({ model: p.model, tools: p.tools });
      return answer(p.model, o?.signal);
    },
  }),
}));

const { AiError, dailyResetText, detailOf, findRecipe, quotaKindOf, quotaMessage, recipeFromLink, TIME_LIMIT_MS } = await import('../src/lib/ai');
const { MOCK_AI } = await import('../src/data/mockAi');

const ok = { response: { text: () => JSON.stringify(MOCK_AI['פאי רועים']) } };
const quota429 = (quotaId: string, retryDelay: string) => Object.assign(new Error('[429 ] You exceeded your current quota'), {
  code: 'fetch-error',
  customErrorData: { status: 429, errorDetails: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
  ] },
});
const LINK = 'https://heninthekitchen.com/blog/2021/12/15/%D7%A4%D7%90%D7%99-%D7%A8%D7%95%D7%A2%D7%99%D7%9D/';

afterEach(() => {
  calls.length = 0;
  vi.useRealTimers();
});

describe('AI on the free plan', () => {
  it('reads a link with URL context only — never Google Search', async () => {
    answer = async () => ok;
    const r = await recipeFromLink(LINK);
    expect(r.via).toBe('link');
    expect(r.recipe.link).toBe(LINK);
    expect(calls).toEqual([{ model: 'gemini-3.5-flash-lite', tools: [{ urlContext: {} }] }]);
  });

  it('finding a dish uses no tools at all', async () => {
    answer = async () => ok;
    expect((await findRecipe('פאי רועים')).via).toBe('ai');
    expect(calls).toEqual([{ model: 'gemini-3.5-flash-lite', tools: [] }]);
  });

  it('out of quota: one try on the other model, then a daily message with the reset time', async () => {
    answer = async () => { throw quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '50000s'); };
    const e = await recipeFromLink(LINK).catch((x) => x);
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash']);
    expect(e).toBeInstanceOf(AiError);
    expect(e.kind).toBe('quota');
    expect(e.message).toMatch(/המכסה החינמית של היום. היא מתחדשת (היום|מחר) בסביבות \d\d:\d\d/);
    expect(e.detail).toBe('429 · GenerateRequestsPerDayPerProjectPerModel-FreeTier · retry 50000s · gemini-3.5-flash-lite, gemini-3.5-flash');
  });

  it('a per-minute limit on either model says "try again in a minute"', async () => {
    answer = async (m) => {
      throw m.includes('lite') ? quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '50000s') : quota429('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '21s');
    };
    const e = await findRecipe('פאי רועים').catch((x) => x);
    expect(e.message).toBe('היו יותר מדי בקשות בדקה האחרונה. נסו שוב בעוד דקה.');
  });

  it('stops after the time limit with a "took too long" message', async () => {
    vi.useFakeTimers();
    answer = (_m, signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('AbortError'))));
    const p = recipeFromLink(LINK).catch((x) => x);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT_MS + 100);
    const e = await p;
    expect(e.kind).toBe('timeout');
    expect(e.message).toMatch(/יותר מדי זמן/);
    expect(e.detail).toBe('timeout 45s · gemini-3.5-flash-lite');
    expect(calls).toHaveLength(1);
  });

  it('a page with no recipe is not retried on the other model', async () => {
    answer = async () => ({ response: { text: () => '{"error": "no-recipe"}' } });
    expect((await recipeFromLink(LINK).catch((x) => x)).kind).toBe('no-recipe');
    expect(calls).toHaveLength(1);
  });
});

describe('quota details', () => {
  it('a short technical line for screenshots', () => {
    expect(detailOf(Object.assign(new Error('[403 ] PERMISSION_DENIED: Firebase App Check token is invalid.'), { code: 'fetch-error' }))).toBe('403 PERMISSION_DENIED');
    expect(detailOf(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
  });
  it('per minute vs per day, from details or message text', () => {
    expect(quotaKindOf(quota429('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '38s'))).toEqual({ kind: 'minute', retrySec: 38 });
    expect(quotaKindOf(quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '7200s')).kind).toBe('day');
    expect(quotaKindOf(new Error('429 Quota exceeded. Please retry in 12.5s.'))).toEqual({ kind: 'minute', retrySec: 13 });
    expect(quotaMessage({ kind: 'minute', retrySec: 300 })).toContain('5 דקות');
  });
  it('daily reset is midnight Pacific, shown on an Israeli clock', () => {
    expect(dailyResetText(new Date('2026-10-19T20:00:00+03:00'))).toBe('מחר בסביבות 10:00');
    expect(dailyResetText(new Date('2026-10-20T08:30:00+03:00'))).toBe('היום בסביבות 10:00');
  });
});
