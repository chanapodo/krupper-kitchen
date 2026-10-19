import { FIREBASE } from '../config';
import { MOCK_AI } from '../data/mockAi';
import { draftFromAi, DraftError, extractJson, findPrompt, knowledgePrompt, linkPrompt } from './recipeDraft';
import type { Recipe } from './types';

/**
 * Recipe finding through Firebase AI Logic (Gemini Developer API backend):
 * no server and no extra key — it uses the app's Firebase project.
 * Demo mode (no Firebase config) answers from canned recipes.
 */

// Fast model with Google Search grounding and URL context; the second is a fallback
// for projects where the newer one isn't available yet.
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash'];

export class AiError extends Error {
  constructor(public kind: 'not-enabled' | 'quota' | 'no-recipe' | 'offline' | 'other', message: string) {
    super(message);
  }
}

const MESSAGES: Record<AiError['kind'], string> = {
  'not-enabled': 'החיפוש החכם עוד לא הופעל בפרויקט (Firebase AI Logic). אפשר בינתיים להוסיף את המנה רק בשם.',
  quota: 'עברנו את מכסת החיפושים החינמית לעכשיו. נסו שוב בעוד כמה דקות, או הוסיפו רק בשם.',
  'no-recipe': 'לא הצלחתי למצוא מתכון מסודר. נסו שם אחר, קישור, או הוסיפו רק בשם.',
  offline: 'אין חיבור לאינטרנט כרגע. נסו שוב כשיש קליטה.',
  other: 'משהו השתבש בחיפוש. נסו שוב, או הוסיפו רק בשם.',
};

export function aiMessage(e: unknown): string {
  return e instanceof AiError ? e.message : MESSAGES.other;
}

function classify(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof DraftError) return new AiError('no-recipe', MESSAGES['no-recipe']);
  const err = e as { code?: string; message?: string; customErrorData?: { status?: number } };
  const msg = `${err?.code ?? ''} ${err?.message ?? ''}`;
  const status = err?.customErrorData?.status;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AiError('offline', MESSAGES.offline);
  if (/api-not-enabled|has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return new AiError('not-enabled', MESSAGES['not-enabled']);
  if (status === 429 || /429|quota|RESOURCE_EXHAUSTED|rate/i.test(msg)) return new AiError('quota', MESSAGES.quota);
  if (/fetch-error|Failed to fetch|NetworkError/i.test(msg)) return new AiError('offline', MESSAGES.offline);
  return new AiError('other', MESSAGES.other);
}

const errText = (e: unknown) => `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? e}`;
// model gone or overloaded: try the next one
const isModelMissing = (e: unknown) => /404|not found|NOT_FOUND|is not supported|503|500|high demand|UNAVAILABLE|overloaded/i.test(errText(e));
const isQuota = (e: unknown) => /429|quota|RESOURCE_EXHAUSTED/i.test(errText(e));
const isToolRejected = (e: unknown) => /400|INVALID_ARGUMENT|url_context|urlContext|tool/i.test(errText(e));

/** Google Search grounding has no free quota on some plans: once refused, skip it this session. */
const NO_SEARCH = 'kk-ai-no-search';

type Part = { text: string } | { fileData: { mimeType: string; fileUri: string } };
type ToolName = 'search' | 'url';

async function generate(parts: Part[], tools: ToolName[]): Promise<string> {
  const [{ getApp }, ai] = await Promise.all([import('firebase/app'), import('firebase/ai')]);
  const inst = ai.getAI(getApp(), { backend: new ai.GoogleAIBackend() });
  const toolDefs = tools.map((t) => (t === 'search' ? { googleSearch: {} } : { urlContext: {} }));
  let last: unknown;
  for (const model of MODELS) {
    try {
      const m = ai.getGenerativeModel(inst, { model, tools: toolDefs, generationConfig: { temperature: 0.4 } });
      const res = await m.generateContent(parts as never);
      return res.response.text();
    } catch (e) {
      last = e;
      if (!isModelMissing(e)) throw e;
    }
  }
  throw last;
}

/** Known names (pantry, list) so new ingredients reuse the family's wording. */
export interface FindOpts {
  known?: string[];
}

export interface FoundRecipe {
  recipe: Recipe;
  /** 'web' = found on the internet; 'ai' = written by the model from what it knows */
  via: 'web' | 'ai' | 'link';
}

export async function findRecipe(dish: string, opts: FindOpts = {}): Promise<FoundRecipe> {
  try {
    if (!FIREBASE) {
      return { recipe: draftFromAi(extractJson(await mockReply(dish)), { fallbackName: dish, known: opts.known }), via: 'web' };
    }
    if (sessionStorage.getItem(NO_SEARCH) !== '1') {
      try {
        const text = await generate([{ text: findPrompt(dish) }], ['search']);
        return { recipe: draftFromAi(extractJson(text), { fallbackName: dish, known: opts.known }), via: 'web' };
      } catch (e) {
        if (!isQuota(e) && !isToolRejected(e)) throw e;
        sessionStorage.setItem(NO_SEARCH, '1');
      }
    }
    const text = await generate([{ text: knowledgePrompt(dish) }], []);
    const recipe = draftFromAi(extractJson(text), { fallbackName: dish, known: opts.known });
    delete recipe.sources;
    delete recipe.link;
    return { recipe, via: 'ai' };
  } catch (e) {
    throw classify(e);
  }
}

export async function recipeFromLink(url: string, opts: FindOpts = {}): Promise<FoundRecipe> {
  try {
    let text: string;
    if (!FIREBASE) {
      text = await mockReply(url);
    } else if (/youtu\.?be/.test(url)) {
      // Gemini watches public YouTube videos directly
      text = await generate([{ fileData: { mimeType: 'video/*', fileUri: url } }, { text: linkPrompt(url, false) }], []);
    } else {
      try {
        text = await generate([{ text: linkPrompt(url, false) }], ['url']);
      } catch (e) {
        if (!isToolRejected(e)) throw e;
        // URL context not available here: let search find and read the page
        text = await generate([{ text: linkPrompt(url, true) }], ['search']);
      }
    }
    return { recipe: draftFromAi(extractJson(text), { fallbackName: '', known: opts.known, link: url }), via: 'link' };
  } catch (e) {
    throw classify(e);
  }
}

async function mockReply(q: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 700));
  const key = Object.keys(MOCK_AI).find((k) => q.includes(k));
  if (!key) return JSON.stringify({ ...MOCK_AI['פאי רועים'], name: q.startsWith('http') ? 'מתכון מהקישור' : q });
  return '```json\n' + JSON.stringify(MOCK_AI[key]) + '\n```';
}
