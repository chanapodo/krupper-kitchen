import type { AiRecipe } from '../lib/recipeDraft';

/** Canned AI answers for demo mode and tests. */
export const MOCK_AI: Record<string, AiRecipe> = {
  'פאי רועים': {
    name: 'פאי רועים',
    ingredients: [
      { name: 'בשר בקר טחון', qty: 600, unit: 'גרם', aisle: 'בשר ועוף', frozenProtein: true },
      { name: 'בצל גדול קצוץ', qty: 1, unit: null, aisle: 'ירקות ופירות' },
      { name: 'גזר', qty: 2, unit: 'יח׳', aisle: 'ירקות ופירות' },
      { name: 'אפונה קפואה', qty: 1, unit: 'כוס', aisle: 'קפואים' },
      { name: 'רסק עגבניות', qty: 2, unit: 'כפות', aisle: 'שימורים ורטבים' },
      { name: 'תפוחי אדמה', qty: 1, unit: 'קג', aisle: 'ירקות ופירות' },
      { name: 'שמן זית', qty: 3, unit: 'כפות', aisle: 'תבלינים ואפייה' },
      { name: 'ציר בקר', qty: 1, unit: 'כוס', aisle: 'תבלינים ואפייה' },
      { name: 'מלח', qty: null, unit: null },
    ],
    steps: [
      '1. מבשלים את תפוחי האדמה במים עם מלח עד שהם רכים, ומועכים לפירה עם שמן זית (בלי חמאה וחלב – כדי שיישאר בשרי).',
      'מטגנים בצל וגזר קצוצים עד שמזהיבים.',
      'מוסיפים את הבשר ומפוררים עד שמשנה צבע, ואז רסק, ציר ואפונה. מבשלים 10 דקות.',
      'מעבירים לתבנית, מכסים בפירה ומסמנים פסים במזלג.',
      'אופים 25 דקות ב־200 מעלות עד שהפירה מזהיב.',
    ],
    minutes: 70,
    difficulty: 2,
    kosher: 'meat',
    meals: ['lunch', 'dinner'],
    cuisine: 'בריטי',
    tags: ['ילדים אוהבים', 'בתנור'],
    sources: ['https://www.example.co.il/shepherds-pie'],
    videoUrl: null,
  },
  'ראמן': {
    name: 'ראמן עוף ביתי',
    ingredients: [
      { name: 'אטריות ראמן', qty: 400, unit: 'גרם', aisle: 'פסטה, אורז ודגנים' },
      { name: 'חזה עוף', qty: 500, unit: 'גרם', frozenProtein: true },
      { name: 'ביצים', qty: 4 },
      { name: 'רוטב סויה', qty: 4, unit: 'כפות' },
      { name: 'ג׳ינג׳ר טרי', qty: 1, unit: 'כף' },
      { name: 'בצל ירוק', qty: 3 },
    ],
    steps: ['מבשלים ציר עם ג׳ינג׳ר וסויה.', 'צורבים את העוף ופורסים.', 'מבשלים אטריות וביצים רכות.', 'מרכיבים קערות.'],
    minutes: 40,
    difficulty: 2,
    kosher: 'meat',
    meals: ['dinner'],
    cuisine: 'יפני',
    tags: ['מיוחד'],
    sources: ['https://www.example.co.il/ramen'],
  },
};

/** A demo supermarket receipt (as the model would read it): junk lines included, to show they are skipped. */
export const MOCK_RECEIPT = {
  items: [
    { raw: 'בננות', name: 'בננות', qty: 1.2, unit: 'ק"ג', aisle: 'ירקות ופירות', kind: 'item' },
    { raw: 'יוגורט דנונה 3% 200 גר', name: 'יוגורט', qty: 4, unit: 'יח׳', aisle: 'חלב וביצים', kind: 'item' },
    { raw: 'ביצים L תבנית 12', name: 'ביצים', qty: 12, unit: 'יח׳', aisle: 'חלב וביצים', kind: 'item' },
    { raw: 'חלב תנובה 3% 1 ליטר', name: 'חלב', qty: 2, unit: 'יח׳', aisle: 'חלב וביצים', kind: 'item' },
    { raw: 'שמן קנולה 1 ל', name: 'שמן קנולה', qty: 1, unit: 'יח׳', aisle: 'תבלינים ואפייה', kind: 'item' },
    { raw: 'פיירי לימון 750 מ"ל', name: 'סבון כלים', qty: 1, unit: 'יח׳', aisle: 'ניקיון וטיפוח', kind: 'item' },
    { raw: 'נייר טואלט לילי 32', name: 'נייר טואלט', qty: 1, unit: 'יח׳', aisle: 'ניקיון וטיפוח', kind: 'item' },
    { raw: 'פיקדון בקבוק', name: 'פיקדון', qty: 2, unit: 'יח׳', aisle: 'אחר', kind: 'deposit' },
    { raw: 'שקית קניה', name: 'שקית', qty: 1, unit: 'יח׳', aisle: 'אחר', kind: 'bag' },
    { raw: 'הנחת מבצע יוגורט', name: 'הנחה', qty: null, unit: null, aisle: 'אחר', kind: 'item' },
    { raw: 'סה"כ לתשלום', name: 'סה"כ', qty: null, unit: null, aisle: 'אחר', kind: 'other' },
  ],
};
