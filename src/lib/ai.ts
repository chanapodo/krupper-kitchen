import { FIREBASE } from '../config';
import { MOCK_AI, MOCK_RECEIPT } from '../data/mockAi';
import { cleanUrl } from './links';
import { linesFromAi, receiptPrompt, type ReceiptLine } from './receipt';
import { draftFromAi, DraftError, extractJson, imagePrompt, knowledgePrompt, linkPrompt, textPrompt } from './recipeDraft';
import type { PantryItem, Recipe } from './types';

/**
 * Recipe finding through Firebase AI Logic (Gemini Developer API backend):
 * no server and no extra key — it uses the app's Firebase project.
 * Demo mode (no Firebase config) answers from canned recipes.
 *
 * Free (Spark) plan rules: never use Google Search grounding (it has no free quota and
 * always answers 429), never retry the same model, and give up after TIME_LIMIT.
 */

// Flash-Lite has the most generous free limits; each model has its own quota,
// so the second one is tried once if the first is out of quota, missing or overloaded.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];
export const TIME_LIMIT_MS = 45_000;

export type QuotaKind = 'minute' | 'day';

export class AiError extends Error {
  /** short technical line (status, quota, model) shown small under the message, for diagnosing from a screenshot */
  detail = '';
  constructor(public kind: 'not-enabled' | 'quota' | 'timeout' | 'no-recipe' | 'blocked' | 'no-receipt' | 'offline' | 'other', message: string) {
    super(message);
  }
}

const MESSAGES: Record<Exclude<AiError['kind'], 'quota'>, string> = {
  'not-enabled': 'החיפוש החכם עוד לא הופעל בפרויקט (Firebase AI Logic). אפשר בינתיים להוסיף את המנה רק בשם.',
  timeout: 'זה לקח יותר מדי זמן (האתר כבד או שהשירות עמוס). נסו שוב בעוד רגע, או הוסיפו רק בשם.',
  'no-recipe': 'לא הצלחתי למצוא מתכון מסודר. נסו שם אחר, קישור, או הוסיפו רק בשם.',
  blocked: 'האתר הזה לא מאפשר לקרוא ממנו מתכונים אוטומטית. אפשר להעתיק ולהדביק את טקסט המתכון, או לצלם מסך של המתכון.',
  'no-receipt': 'לא הצלחתי לקרוא מוצרים מהקבלה. נסו צילום חד וישר יותר, עם כל הקבלה בתמונה.',
  offline: 'אין חיבור לאינטרנט כרגע. נסו שוב כשיש קליטה.',
  other: 'משהו השתבש בחיפוש. נסו שוב, או הוסיפו רק בשם.',
};

export function aiMessage(e: unknown): string {
  return e instanceof AiError ? e.message : MESSAGES.other;
}

export function aiDetail(e: unknown): string {
  return e instanceof AiError ? e.detail : '';
}

/** e.g. "429 RESOURCE_EXHAUSTED · GenerateRequestsPerDayPerProjectPerModel-FreeTier · retry 50000s · gemini-3.5-flash-lite" */
export function detailOf(e: unknown): string {
  if (e instanceof DraftError) return `draft: ${e.message}`;
  const err = e as { code?: string; message?: string; model?: string; customErrorData?: { status?: number; statusText?: string } };
  const t = errText(e);
  const status = err?.customErrorData?.status ?? t.match(/\b([45]\d\d)\b/)?.[1];
  const name = t.match(/\b(RESOURCE_EXHAUSTED|PERMISSION_DENIED|INVALID_ARGUMENT|NOT_FOUND|UNAVAILABLE|UNAUTHENTICATED|FAILED_PRECONDITION|DEADLINE_EXCEEDED|INTERNAL)\b/)?.[1];
  const quotaId = t.match(/"quotaId"\s*:\s*"([^"]+)"/)?.[1];
  const retry = quotaKindOf(e).retrySec;
  const parts = [[status, name].filter(Boolean).join(' ') || err?.code, quotaId, retry !== undefined && /429|quota/i.test(t) ? `retry ${retry}s` : '', err?.model];
  if (!status && !name) parts.push(String(err?.message ?? e).slice(0, 80));
  return parts.filter(Boolean).join(' · ');
}

const errText = (e: unknown) => {
  const err = e as { code?: string; message?: string; customErrorData?: { errorDetails?: unknown } };
  return `${err?.code ?? ''} ${err?.message ?? e} ${JSON.stringify(err?.customErrorData?.errorDetails ?? '')}`;
};
const statusOf = (e: unknown) => (e as { customErrorData?: { status?: number } })?.customErrorData?.status;

const isQuota = (e: unknown) => statusOf(e) === 429 || /429|quota|RESOURCE_EXHAUSTED/i.test(errText(e));
// worth one try on the other model: missing, overloaded, or this model rejects the tool
const tryNext = (e: unknown) =>
  /404|not found|NOT_FOUND|is not supported|500|503|high demand|UNAVAILABLE|overloaded|url_context|urlContext/i.test(errText(e));

/** Per-minute or daily limit, from the 429's QuotaFailure / RetryInfo details (or its message). */
export function quotaKindOf(e: unknown): { kind: QuotaKind; retrySec?: number } {
  const t = errText(e);
  const m = t.match(/retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? t.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  const retrySec = m ? Math.ceil(Number(m[1])) : undefined;
  if (/PerDay|per_day|daily/i.test(t) || (retrySec ?? 0) > 3600) return { kind: 'day', retrySec };
  return { kind: 'minute', retrySec };
}

/** Gemini's daily limits reset at midnight Pacific time; when is that on an Israeli clock? */
export function dailyResetText(now = new Date()): string {
  const la = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const sinceMidnight = (Number(la.hour) * 3600 + Number(la.minute) * 60 + Number(la.second)) * 1000;
  const reset = new Date(now.getTime() + 24 * 3600 * 1000 - sinceMidnight);
  const il = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', ...o }).format(d);
  const day = il(reset, { dateStyle: 'short' }) === il(now, { dateStyle: 'short' }) ? 'היום' : 'מחר';
  return `${day} בסביבות ${il(reset, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
}

export function quotaMessage(q: { kind: QuotaKind; retrySec?: number }, now = new Date()): string {
  if (q.kind === 'day') return `נגמרה המכסה החינמית של היום. היא מתחדשת ${dailyResetText(now)} (שעון ישראל). בינתיים אפשר להוסיף את המנה רק בשם.`;
  const wait = q.retrySec && q.retrySec > 90 ? `${Math.ceil(q.retrySec / 60)} דקות` : 'דקה';
  return `היו יותר מדי בקשות בדקה האחרונה. נסו שוב בעוד ${wait}.`;
}

function classify(e: unknown): AiError {
  const out = toAiError(e);
  if (!out.detail) out.detail = detailOf(e);
  if (e !== out) console.warn('AI error', out.kind, out.detail, e);
  return out;
}

function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof DraftError) return new AiError('no-recipe', MESSAGES['no-recipe']);
  const msg = errText(e);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AiError('offline', MESSAGES.offline);
  if (/api-not-enabled|has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return new AiError('not-enabled', MESSAGES['not-enabled']);
  if (isQuota(e)) return new AiError('quota', quotaMessage(quotaKindOf(e)));
  if (/AbortError|aborted|timed? ?out|DEADLINE_EXCEEDED|504/i.test(msg)) return new AiError('timeout', MESSAGES.timeout);
  if (/fetch-error|Failed to fetch|NetworkError/i.test(msg)) return new AiError('offline', MESSAGES.offline);
  return new AiError('other', MESSAGES.other);
}

type Part = { text: string } | { fileData: { mimeType: string; fileUri: string } } | { inlineData: { mimeType: string; data: string } };

/** An image or PDF for the model, base64 without the data: prefix. */
export interface InlineFile {
  mimeType: string;
  data: string;
}

interface Reply {
  text: string;
  /** URL context: did the link open? (e.g. URL_RETRIEVAL_STATUS_ERROR when the site blocks it) */
  urlStatus?: string[];
}

async function generate(parts: Part[], tools: 'url'[] = []): Promise<Reply> {
  const [{ getApp }, ai] = await Promise.all([import('firebase/app'), import('firebase/ai')]);
  const inst = ai.getAI(getApp(), { backend: new ai.GoogleAIBackend() });
  const toolDefs = tools.map(() => ({ urlContext: {} }));
  const deadline = Date.now() + TIME_LIMIT_MS;
  const errors: unknown[] = [];
  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const m = ai.getGenerativeModel(inst, { model, tools: toolDefs, generationConfig: { temperature: 0.4 } });
      const res = await Promise.race([
        m.generateContent(parts as never, { signal: ctrl.signal, timeout: left }),
        new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new AiError('timeout', MESSAGES.timeout)))),
      ]);
      const meta = (res.response.candidates?.[0] as { urlContextMetadata?: { urlMetadata?: { urlRetrievalStatus?: string }[] } } | undefined)?.urlContextMetadata;
      return { text: res.response.text(), urlStatus: meta?.urlMetadata?.map((u) => u.urlRetrievalStatus ?? '') };
    } catch (e) {
      if (ctrl.signal.aborted) {
        const t = new AiError('timeout', MESSAGES.timeout);
        t.detail = `timeout ${Math.round(TIME_LIMIT_MS / 1000)}s · ${model}`;
        throw t;
      }
      if (e && typeof e === 'object') (e as { model?: string }).model = model;
      errors.push(e);
      if (!isQuota(e) && !tryNext(e)) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!errors.length) throw new AiError('timeout', MESSAGES.timeout);
  // both out of quota: if either is only a per-minute limit, that's the one worth reporting
  const quotas = errors.filter(isQuota);
  const pick = quotas.find((e) => quotaKindOf(e).kind === 'minute') ?? quotas[0] ?? errors[errors.length - 1];
  if (pick && typeof pick === 'object') (pick as { model?: string }).model = errors.map((e) => (e as { model?: string })?.model).join(', ');
  throw pick;
}

/** Known names (pantry, list) so new ingredients reuse the family's wording. */
export interface FindOpts {
  known?: string[];
}

export interface FoundRecipe {
  recipe: Recipe;
  /** 'ai' = written by the model from what it knows; 'link' / 'text' / 'image' = read from what was given */
  via: 'ai' | 'link' | 'text' | 'image';
}

export async function findRecipe(dish: string, opts: FindOpts = {}): Promise<FoundRecipe> {
  try {
    const text = FIREBASE ? (await generate([{ text: knowledgePrompt(dish) }])).text : await mockReply(dish);
    const recipe = draftFromAi(extractJson(text), { fallbackName: dish, known: opts.known });
    delete recipe.sources;
    delete recipe.link;
    return { recipe, via: 'ai' };
  } catch (e) {
    throw classify(e);
  }
}

export async function recipeFromLink(rawUrl: string, opts: FindOpts = {}): Promise<FoundRecipe> {
  const url = cleanUrl(rawUrl);
  let reply: Reply | undefined;
  try {
    if (!FIREBASE) {
      reply = { text: await mockReply(url) };
    } else if (/youtu\.?be/.test(url)) {
      // Gemini watches public YouTube videos directly
      reply = await generate([{ fileData: { mimeType: 'video/*', fileUri: url } }, { text: linkPrompt(url) }]);
    } else {
      // URL context reads the page; no search fallback (no free quota for it)
      reply = await generate([{ text: linkPrompt(url) }], ['url']);
    }
    return { recipe: draftFromAi(extractJson(reply.text), { fallbackName: '', known: opts.known, link: url }), via: 'link' };
  } catch (e) {
    // the site refused Google's reader (robots.txt blocks "Google-Extended", e.g. foodsdictionary.co.il)
    if (e instanceof DraftError && reply?.urlStatus?.some((s) => s && s !== 'URL_RETRIEVAL_STATUS_SUCCESS')) {
      const b = new AiError('blocked', MESSAGES.blocked);
      b.detail = `url context: ${reply.urlStatus.join(', ')} · ${hostOf(url)}`;
      throw b;
    }
    throw classify(e);
  }
}

/** A recipe pasted as text (from a site that can't be read automatically, a message, a note). */
export async function recipeFromText(pasted: string, opts: FindOpts = {}): Promise<FoundRecipe> {
  try {
    const text = FIREBASE ? (await generate([{ text: textPrompt(pasted) }])).text : await mockReply(pasted);
    const recipe = draftFromAi(extractJson(text), { fallbackName: '', known: opts.known });
    delete recipe.sources;
    delete recipe.link;
    return { recipe, via: 'text' };
  } catch (e) {
    throw classify(e);
  }
}

/** A photo or screenshot of a recipe (a cookbook page, a screenshot of a site or a post). */
export async function recipeFromImage(file: InlineFile, opts: FindOpts = {}): Promise<FoundRecipe> {
  try {
    const text = FIREBASE ? (await generate([{ inlineData: file }, { text: imagePrompt() }])).text : await mockReply('צילום');
    const recipe = draftFromAi(extractJson(text), { fallbackName: '', known: opts.known });
    delete recipe.sources;
    delete recipe.link;
    return { recipe, via: 'image' };
  } catch (e) {
    throw classify(e);
  }
}

/** Read a supermarket receipt (photo or PDF) into review lines. Inline data only, never search. */
export async function readReceipt(file: InlineFile, opts: { known?: string[]; pantry?: PantryItem[] } = {}): Promise<ReceiptLine[]> {
  try {
    const text = FIREBASE ? (await generate([{ inlineData: file }, { text: receiptPrompt() }])).text : await mockReceipt();
    const lines = linesFromAi(text, opts);
    if (!lines.length) throw new AiError('no-receipt', MESSAGES['no-receipt']);
    return lines;
  } catch (e) {
    if (e instanceof DraftError) {
      const r = new AiError('no-receipt', MESSAGES['no-receipt']);
      r.detail = `receipt: ${e.message}`;
      throw r;
    }
    throw classify(e);
  }
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

async function mockReceipt(): Promise<string> {
  await new Promise((r) => setTimeout(r, 700));
  return JSON.stringify(MOCK_RECEIPT);
}

async function mockReply(q: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 700));
  const key = Object.keys(MOCK_AI).find((k) => q.includes(k));
  if (!key) return JSON.stringify({ ...MOCK_AI['פאי רועים'], name: q.startsWith('http') ? 'מתכון מהקישור' : q });
  return '```json\n' + JSON.stringify(MOCK_AI[key]) + '\n```';
}
