export type Kosher = 'meat' | 'dairy' | 'parve';
export type MealType = 'lunch' | 'dinner';
export type Role = 'parent' | 'kid';
/** 'home' = cleaning & personal care (ניקיון וטיפוח) */
export type Location = 'fridge' | 'freezer' | 'pantry' | 'home';
export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface Member {
  id: string;
  name: string;
  role: Role;
  emoji: string;
  color: string;
  /** for Hebrew verbs in notices ("נעם הוסיף", "גפן הוסיפה") */
  gender?: 'm' | 'f';
}

export interface Settings {
  familyName: string;
  members: Member[];
  shabbat: boolean;
  pinSet: boolean;
}

export interface Ingredient {
  name: string;
  qty?: number;
  unit?: string;
  /** store aisle, for ingredients the catalog doesn't know */
  aisle?: string;
  /** frozen meat/chicken/fish that must be taken out to thaw */
  thaw?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  emoji: string;
  cuisine: string;
  kosher: Kosher;
  meals: MealType[];
  minutes: number;
  difficulty: 1 | 2 | 3;
  kidsCanHelp: boolean;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  photoUrl?: string;
  videoUrl?: string;
  link?: string;
  /** memberId -> 1..5 */
  ratings: Record<string, number>;
  /** 'pending' = a kid's suggestion waiting for a parent; hidden from the bank until approved */
  status?: 'pending';
  /** where an AI-found recipe came from */
  sources?: string[];
  createdBy?: string;
  createdAt: number;
  /** deleted by a parent: kept 30 days under "נמחקו לאחרונה" so it can be restored */
  removedAt?: number;
}

export interface Slot {
  recipeIds: string[];
  note?: string;
}

export interface Week {
  id: string; // Sunday date, YYYY-MM-DD
  days: Partial<Record<DayKey, Partial<Record<MealType, Slot>>>>;
  /** ingredient keys a parent marked "not needed" for the shopping list */
  skipped: string[];
}

export interface Vote {
  id: string; // `${weekId}_${memberId}`
  weekId: string;
  memberId: string;
  recipeIds: string[];
  wishes: string[]; // free-text proposals
  updatedAt: number;
}

/** 'bought' and 'removed' are history: shown under "recently bought / removed" with a restore button */
export type ShoppingStatus = 'pending' | 'active' | 'bought' | 'removed';

export interface ShoppingItem {
  id: string;
  name: string;
  qty?: number;
  unit?: string;
  aisle: string;
  status: ShoppingStatus;
  addedBy: string; // memberId
  note?: string;
  createdAt: number;
  // ---- history (status bought / removed) ----
  doneAt?: number;
  doneBy?: string; // memberId
  /** status before it left the list ('active', or 'pending' for a rejected suggestion); absent for menu rows */
  prevStatus?: 'active' | 'pending';
  /** a row computed from the menu: its ingredient key, and the week whose "not needed" list it joined */
  menuKey?: string;
  weekId?: string;
  recipes?: string[];
  /** a purchase moved this into the pantry: enough to take it back out */
  pantry?: { id: string; created: boolean; qty?: number; unit?: string; prevQty?: number; prevUnit?: string; prevLevel?: Level | null };
  /** the anonymous user who created this doc (lets a kid undo their own add) */
  uid?: string;
}

/** How much is left of an item kept by level (oil, flour, rice, spices, dish soap...) */
export type Level = 'full' | 'half' | 'low' | 'out';
/** 'count' = a number of units (eggs, yogurts, cans); 'level' = מלא / חצי / כמעט נגמר / נגמר */
export type QtyMode = 'count' | 'level';

export interface PantryItem {
  id: string;
  name: string;
  /** count mode: how many (0 = ran out). Older docs may have any unit here. */
  qty?: number;
  unit?: string;
  /** absent on docs from before v1.3: see modeOf() / levelOf() */
  mode?: QtyMode;
  level?: Level;
  location: Location;
  updatedAt: number;
  updatedBy?: string;
  uid?: string;
  /** removed by a parent: kept a week under "הוסרו לאחרונה" so it can be restored */
  removedAt?: number;
}

/** An in-app notice for the parents ("גפן הוסיפה מילקי לרשימת הקניות"). */
export interface Notice {
  id: string;
  text: string;
  kind: 'shop' | 'pantry' | 'recipe' | 'receipt' | 'menu';
  by: string; // memberId
  at: number;
  /** parent memberId -> read */
  readBy?: Record<string, boolean>;
  /** the kid undid the action right away */
  undone?: boolean;
}

/** Something a kid asked for that waits for a parent's approval. */
export interface ApprovalRequest {
  id: string;
  kind: 'menu-add' | 'shop-remove';
  by: string; // memberId
  at: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decidedAt?: number;
  decidedBy?: string;
  /** shown in the feed: the dish or the item */
  title: string;
  // menu-add
  weekId?: string;
  day?: DayKey;
  meal?: MealType;
  recipeId?: string;
  // shop-remove: a manual item's doc id, or a menu row's ingredient key (+ week)
  itemId?: string;
  menuKey?: string;
  /** after an approved removal: the history doc, so the decision can be reversed */
  resultId?: string;
  uid?: string;
}

export interface ThawPlan {
  /** date YYYY-MM-DD -> what to take out the evening before */
  byDate: Record<string, { text: string; items: string[]; meals: string[] }>;
  updatedAt: number;
}
