// Regression fixture from the Phase 1 one-shot run "content-fill" (docs/prompts.md). The kit:window block
// is cut to a stand-in; everything after it is the plugin code the agent wrote, verbatim.
const KIT_PROTOCOL = 1;
// ==== kit:window:end ====

// ---- Your plugin starts here ----
// Content fill: replaces the text of the selected text layers with realistic placeholder names,
// emails, dates or numbers, a different value per layer. Messages with ui.html: 'fill' comes in;
// 'selection', 'filled' and 'settings' go out. kit:* messages belong to the block above.

installKitWindow({ mode: 'fit-content' });

type FillKind = 'name' | 'email' | 'date' | 'number';

const FILL_KINDS: ReadonlyArray<string> = ['name', 'email', 'date', 'number'];
// clientStorage is already scoped to this plugin's manifest id; the prefix keeps it apart from
// the kit's own 'kit:window' record.
const FILL_KIND_STORAGE_KEY = 'content-fill:kind';
// When a pool runs out of fresh combinations, a repeat is accepted after this many draws.
const FILL_UNIQUE_TRIES = 40;
const FILL_DAY_MS = 24 * 60 * 60 * 1000;

// Plain ASCII letters only, so emails can be built from the same names.
const FILL_FIRST_NAMES: ReadonlyArray<string> = [
  'Maya', 'Daniel', 'Priya', 'Lucas', 'Amara', 'Noah', 'Sofia', 'Kenji', 'Elena', 'Omar',
  'Chloe', 'Mateo', 'Aisha', 'Liam', 'Hana', 'Ethan', 'Zara', 'Felix', 'Nina', 'Samuel',
  'Leila', 'Oscar', 'Yuki', 'Gabriel', 'Ingrid', 'Arjun', 'Clara', 'Diego', 'Freya', 'Isaac',
  'Mei', 'Jonas', 'Fatima', 'Leo', 'Olivia', 'Ravi', 'Sara', 'Tomas', 'Valentina', 'Wei',
];
const FILL_LAST_NAMES: ReadonlyArray<string> = [
  'Chen', 'Okafor', 'Nair', 'Silva', 'Johansson', 'Novak', 'Rossi', 'Tanaka', 'Haddad', 'Martin',
  'Kowalski', 'Fernandez', 'Mensah', 'Larsen', 'Patel', 'Kim', 'Dubois', 'Moreau', 'Schmidt', 'Nguyen',
  'Adeyemi', 'Costa', 'Brooks', 'Walsh', 'Ortiz', 'Sato', 'Bauer', 'Hughes', 'Ali', 'Reyes',
  'Murphy', 'Varga', 'Mendes', 'Clarke', 'Yilmaz', 'Park', 'Ahmed', 'Romero', 'Fischer', 'Bennett',
];
const FILL_EMAIL_DOMAINS: ReadonlyArray<string> = [
  'gmail.com', 'outlook.com', 'icloud.com', 'yahoo.com', 'proton.me', 'hey.com', 'fastmail.com',
];
const FILL_MONTHS: ReadonlyArray<string> = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Sent by the UI when the person presses Fill. */
interface FillRequestMessage {
  type: 'fill';
  kind: FillKind;
}

/** Sent back after every fill request, also when nothing could be filled, so the UI never waits. */
interface FillResultMessage {
  type: 'filled';
  kind: FillKind;
  /** Layers whose text was replaced. */
  filled: number;
  /** Layers skipped because one of their fonts is missing or could not be loaded. */
  missingFont: number;
  /** Layers Figma refused to edit. */
  failed: number;
  /** Set when the fill stopped on an unexpected error. */
  error: string | null;
}

// Messages arrive untyped from another window: check the shape before trusting it.
function messageType(msg: unknown): unknown {
  return typeof msg === 'object' && msg !== null ? (msg as { type?: unknown }).type : undefined;
}

function isFillKind(value: unknown): value is FillKind {
  return typeof value === 'string' && FILL_KINDS.indexOf(value) >= 0;
}

function isFillRequest(msg: unknown): msg is FillRequestMessage {
  return messageType(msg) === 'fill' && isFillKind((msg as { kind?: unknown }).kind);
}

// Duck-typed rather than instanceof Error: an error thrown by Figma's side may come from
// another realm, whose Error is not this script's.
function errorText(error: unknown): string {
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : String(error);
}

// ---- Content ----

/** A whole number from min to max, both included. */
function fillRandomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function fillPick(items: ReadonlyArray<string>): string {
  return items[fillRandomInt(0, items.length - 1)];
}

/** 1284 -> "1,284". Written out because Intl is not promised in the plugin sandbox. */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function makeName(): string {
  return fillPick(FILL_FIRST_NAMES) + ' ' + fillPick(FILL_LAST_NAMES);
}

function makeEmail(): string {
  const first = fillPick(FILL_FIRST_NAMES).toLowerCase();
  const last = fillPick(FILL_LAST_NAMES).toLowerCase();
  const local = [
    first + '.' + last,
    first + last,
    first.charAt(0) + last,
    first + '_' + last,
    first + last.charAt(0),
    first + '.' + last + fillRandomInt(1, 99),
  ];
  return local[fillRandomInt(0, local.length - 1)] + '@' + fillPick(FILL_EMAIL_DOMAINS);
}

/** A day from about 18 months ago to 6 months ahead, written "Mar 14, 2026". */
function makeDate(): string {
  const date = new Date(Date.now() + fillRandomInt(-540, 180) * FILL_DAY_MS);
  return FILL_MONTHS[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

/** 2 to 6 digits, so a list mixes values such as 48, 1,284 and 36,572. */
function makeNumber(): string {
  const digits = fillRandomInt(2, 6);
  return groupThousands(fillRandomInt(Math.pow(10, digits - 1), Math.pow(10, digits) - 1));
}

const FILL_MAKERS: { readonly [kind in FillKind]: () => string } = {
  name: makeName,
  email: makeEmail,
  date: makeDate,
  number: makeNumber,
};

/** One value per layer, all different while the pool allows it. */
function makeValues(kind: FillKind, count: number): string[] {
  const make = FILL_MAKERS[kind];
  const seen = new Set<string>();
  const values: string[] = [];
  for (let i = 0; i < count; i++) {
    let value = make();
    for (let tries = 0; seen.has(value) && tries < FILL_UNIQUE_TRIES; tries++) value = make();
    seen.add(value);
    values.push(value);
  }
  return values;
}

// ---- Selection ----

function isTextNode(node: SceneNode): node is TextNode {
  return node.type === 'TEXT';
}

function postSelection(): void {
  // Under "documentAccess": "dynamic-page" the current page is always loaded, so reading its
  // selection synchronously is allowed.
  const selection = figma.currentPage.selection;
  const text = selection.filter(isTextNode).length;
  figma.ui.postMessage({ type: 'selection', text, other: selection.length - text });
}

// ---- Fill ----

function fontKey(font: FontName): string {
  return font.family + '\n' + font.style;
}

/** Every font a layer uses. fontName is figma.mixed when ranges differ, so ask per range. */
function fontsOf(node: TextNode): FontName[] {
  const length = node.characters.length;
  if (length > 0) return node.getRangeAllFontNames(0, length);
  // An empty layer has no ranges to ask about, but it still has the font new text will use.
  const font = node.fontName;
  return font === figma.mixed ? [] : [font];
}

/** Replaces the text of the selected text layers; counts go into result as it works. */
async function fillSelection(kind: FillKind, result: FillResultMessage): Promise<void> {
  const nodes = figma.currentPage.selection.filter(isTextNode);
  const fontsByNode = new Map<TextNode, FontName[]>();
  const wanted = new Map<string, FontName>();
  for (const node of nodes) {
    // A font missing from this machine can't be loaded, and editing the layer would throw.
    if (node.hasMissingFont) continue;
    const fonts = fontsOf(node);
    fontsByNode.set(node, fonts);
    for (const font of fonts) wanted.set(fontKey(font), font);
  }

  // Each font is loaded once, all in parallel. A font that fails skips only the layers using it.
  const loaded = new Set<string>();
  await Promise.all(Array.from(wanted.entries()).map(async ([key, font]) => {
    try {
      await figma.loadFontAsync({ family: font.family, style: font.style });
      loaded.add(key);
    } catch (error) {
      console.warn('content fill: could not load ' + font.family + ' ' + font.style + ': ' + errorText(error));
    }
  }));

  const values = makeValues(kind, nodes.length);
  nodes.forEach((node, i) => {
    const fonts = fontsByNode.get(node);
    if (!fonts || !fonts.every((font) => loaded.has(fontKey(font)))) {
      result.missingFont++;
      return;
    }
    try {
      // The new text takes the style of the layer's first character.
      node.characters = values[i];
      result.filled++;
    } catch (error) {
      console.warn('content fill: could not edit "' + node.name + '": ' + errorText(error));
      result.failed++;
    }
  });

  // One undo step per fill, so Cmd+Z takes back exactly the last press of Fill.
  if (result.filled > 0) figma.commitUndo();
}

async function handleFill(kind: FillKind): Promise<void> {
  const result: FillResultMessage = { type: 'filled', kind, filled: 0, missingFont: 0, failed: 0, error: null };
  try {
    await fillSelection(kind, result);
  } catch (error) {
    result.error = errorText(error);
    console.error('content fill failed', error);
  }
  // Always answer, so the busy Fill button never gets stuck.
  figma.ui.postMessage(result);
  try {
    await figma.clientStorage.setAsync(FILL_KIND_STORAGE_KEY, kind);
  } catch {
    // Not remembered for next time; the fill itself is done.
  }
}

/** Tells the UI which content was used last time, so the dropdown starts there. */
async function postSavedKind(): Promise<void> {
  try {
    const kind: unknown = await figma.clientStorage.getAsync(FILL_KIND_STORAGE_KEY);
    if (isFillKind(kind)) figma.ui.postMessage({ type: 'settings', kind });
  } catch {
    // Nothing remembered: the dropdown keeps its first option.
  }
}

figma.ui.on('message', (msg: unknown) => {
  if (!isFillRequest(msg)) return; // kit:* and anything else falls through
  void handleFill(msg.kind);
});

figma.on('selectionchange', postSelection);
postSelection();
void postSavedKind();
