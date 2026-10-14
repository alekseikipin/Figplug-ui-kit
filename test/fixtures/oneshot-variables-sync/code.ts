// Regression fixture from the Phase 1 one-shot run "variables-sync" (docs/prompts.md). The kit:window block
// is cut to a stand-in; everything after it is the plugin code the agent wrote, verbatim.
const KIT_PROTOCOL = 1;
// ==== kit:window:end ====

// ---- Your plugin starts here ----
// Color variables: lists the file's local color variables, per collection and mode, and sets a
// value from a hex code typed in the UI. Messages with ui.html (none start with kit:):
//   UI -> main  { type: 'load-variables' }
//               { type: 'set-color', variableId, collectionId, modeId, hex }
//   main -> UI  { type: 'variables', collections: VsCollectionEntry[] }
//               { type: 'variables-error', message }
//               { type: 'color-set', variableId, modeId, ok, hex, message }

// A long list stops at 640 px and the page scrolls, instead of growing to the default 900.
installKitWindow({ mode: 'fit-content', size: { width: 360, height: 480 }, bounds: { maxHeight: 640 } });

// Every name below starts with Vs (variables sync): code.ts shares one global namespace with
// Figma's typings, where Variable, VariableAlias, RGB and RGBA are already taken.

/** One mode's value, flattened to plain data for the UI. */
interface VsValue {
  /** '#RRGGBB', or '#RRGGBBAA' when not opaque; null when an alias cannot be resolved. */
  hex: string | null;
  /** 'alias' points at another variable; 'composed' has its colour or opacity bound to variables. */
  kind: 'color' | 'alias' | 'composed';
  /** The name of the variable an alias (or a composed colour) points at, when it can be read. */
  aliasName: string | null;
}

interface VsVariableEntry {
  id: string;
  name: string;
  values: { [modeId: string]: VsValue };
}

interface VsCollectionEntry {
  id: string;
  name: string;
  defaultModeId: string;
  modes: Array<{ modeId: string; name: string }>;
  variables: VsVariableEntry[];
}

interface VsSetColorMessage {
  type: 'set-color';
  variableId: string;
  collectionId: string;
  modeId: string;
  hex: string;
}

// Figma rejects alias cycles; this cap is the backstop.
const VS_MAX_ALIAS_DEPTH = 10;

// Messages and variable values arrive untyped: check the shape before trusting it.
function vsIsObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null;
}

function vsIsAlias(value: unknown): value is VariableAlias {
  return vsIsObject(value) && value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string';
}

function vsIsColor(value: unknown): value is RGB | RGBA {
  return vsIsObject(value) && typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number';
}

function vsIsComposed(value: unknown): value is VariableComposedColor {
  return vsIsObject(value) && 'color' in value && 'opacity' in value;
}

function vsIsSetColorMessage(msg: unknown): msg is VsSetColorMessage {
  return vsIsObject(msg) && msg.type === 'set-color' && typeof msg.variableId === 'string' &&
    typeof msg.collectionId === 'string' && typeof msg.modeId === 'string' && typeof msg.hex === 'string';
}

function vsErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function vsChannel(value: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, value)) * 255);
  return (byte < 16 ? '0' : '') + byte.toString(16).toUpperCase();
}

function vsToHex(color: RGB | RGBA): string {
  const hex = '#' + vsChannel(color.r) + vsChannel(color.g) + vsChannel(color.b);
  const alpha = 'a' in color && typeof color.a === 'number' ? color.a : 1;
  return Math.round(Math.min(1, Math.max(0, alpha)) * 255) < 255 ? hex + vsChannel(alpha) : hex;
}

/**
 * '#RGB', '#RGBA', '#RRGGBB' or '#RRGGBBAA', with or without '#', in any case; null otherwise.
 * The UI validates first; this is the backstop, so a bad message can never reach the document.
 */
function vsParseHex(text: string): RGBA | null {
  let digits = text.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(digits)) return null;
  if (digits.length <= 4) digits = digits.split('').map((d) => d + d).join('');
  const byte = (at: number): number => parseInt(digits.slice(at, at + 2), 16) / 255;
  return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) : 1 };
}

/** Reads every local collection that holds color variables, in the order Figma lists them. */
async function vsReadCollections(): Promise<VsCollectionEntry[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const colorVariables = await figma.variables.getLocalVariablesAsync('COLOR');

  // Aliases often point at the same few variables: look each one up once per read.
  const variables = new Map<string, Variable | null>();
  const collectionsById = new Map<string, VariableCollection | null>();
  for (const variable of colorVariables) variables.set(variable.id, variable);
  for (const collection of collections) collectionsById.set(collection.id, collection);

  const getVariable = async (id: string): Promise<Variable | null> => {
    if (!variables.has(id)) {
      let found: Variable | null = null;
      try {
        found = await figma.variables.getVariableByIdAsync(id);
      } catch {
        found = null; // a library variable this file cannot read
      }
      variables.set(id, found);
    }
    return variables.get(id) ?? null;
  };

  const getCollection = async (id: string): Promise<VariableCollection | null> => {
    if (!collectionsById.has(id)) {
      let found: VariableCollection | null = null;
      try {
        found = await figma.variables.getVariableCollectionByIdAsync(id);
      } catch {
        found = null;
      }
      collectionsById.set(id, found);
    }
    return collectionsById.get(id) ?? null;
  };

  // Follows an alias chain to a colour for the swatch. An alias into the same collection uses the
  // same mode; one into another collection uses that collection's default mode.
  const resolve = async (value: VariableValue, modeId: string, collectionId: string, depth: number): Promise<RGB | RGBA | null> => {
    if (vsIsColor(value)) return value;
    if (vsIsComposed(value)) return vsIsColor(value.color) ? value.color : resolve(value.color, modeId, collectionId, depth + 1);
    if (!vsIsAlias(value) || depth >= VS_MAX_ALIAS_DEPTH) return null;
    const target = await getVariable(value.id);
    if (!target || target.resolvedType !== 'COLOR') return null;
    let targetMode = modeId;
    if (target.variableCollectionId !== collectionId || target.valuesByMode[modeId] === undefined) {
      const targetCollection = await getCollection(target.variableCollectionId);
      targetMode = targetCollection ? targetCollection.defaultModeId : Object.keys(target.valuesByMode)[0];
    }
    const next = target.valuesByMode[targetMode];
    return next === undefined ? null : resolve(next, targetMode, target.variableCollectionId, depth + 1);
  };

  const describe = async (value: VariableValue, modeId: string, collectionId: string): Promise<VsValue> => {
    if (vsIsColor(value)) return { hex: vsToHex(value), kind: 'color', aliasName: null };
    const color = await resolve(value, modeId, collectionId, 0);
    const hex = color ? vsToHex(color) : null;
    const link = vsIsAlias(value) ? value : vsIsComposed(value) && vsIsAlias(value.color) ? value.color : null;
    const target = link ? await getVariable(link.id) : null;
    return { hex, kind: vsIsAlias(value) ? 'alias' : 'composed', aliasName: target ? target.name : null };
  };

  const result: VsCollectionEntry[] = [];
  for (const collection of collections) {
    const entries: VsVariableEntry[] = [];
    for (const id of collection.variableIds) {
      // A plain collection only lists its own variables, all of them local, so a non-colour id is
      // skipped without a lookup. An extended collection also inherits its parent's variables.
      if (!collection.isExtension && !variables.has(id)) continue;
      const variable = await getVariable(id);
      if (!variable || variable.resolvedType !== 'COLOR') continue;
      let byMode: { [modeId: string]: VariableValue } = variable.valuesByMode;
      if (collection.isExtension) {
        try {
          byMode = await variable.valuesByModeForCollectionAsync(collection);
        } catch {
          continue;
        }
      }
      const values: { [modeId: string]: VsValue } = {};
      for (const mode of collection.modes) {
        const value = byMode[mode.modeId];
        if (value !== undefined) values[mode.modeId] = await describe(value, mode.modeId, collection.id);
      }
      entries.push({ id: variable.id, name: variable.name, values });
    }
    if (entries.length === 0) continue;
    result.push({
      id: collection.id,
      name: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((mode) => ({ modeId: mode.modeId, name: mode.name })),
      variables: entries,
    });
  }
  return result;
}

// Only the newest read answers, so a slow early read can never overwrite a newer list.
let vsReadGeneration = 0;

/** Reads the variables and posts them. Never rejects: the UI always gets an answer. */
async function vsPostVariables(): Promise<void> {
  const generation = ++vsReadGeneration;
  let message: { type: 'variables'; collections: VsCollectionEntry[] } | { type: 'variables-error'; message: string };
  try {
    message = { type: 'variables', collections: await vsReadCollections() };
  } catch (error) {
    message = { type: 'variables-error', message: vsErrorText(error) };
  }
  if (generation !== vsReadGeneration) return;
  try {
    figma.ui.postMessage(message);
  } catch {
    // The plugin was closed while the variables were being read: no UI is left to answer.
  }
}

/** Sets one variable's value in one mode, answers with color-set, then sends the fresh list. */
async function vsSetColor(msg: VsSetColorMessage): Promise<void> {
  const answer = (ok: boolean, hex: string | null, message: string): void => {
    try {
      figma.ui.postMessage({ type: 'color-set', variableId: msg.variableId, modeId: msg.modeId, ok, hex, message });
    } catch {
      // The plugin was closed meanwhile.
    }
  };
  try {
    const color = vsParseHex(msg.hex);
    const variable = await figma.variables.getVariableByIdAsync(msg.variableId);
    const collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
    if (!color) {
      answer(false, null, 'enter a hex code such as #0D99FF.');
    } else if (!variable || variable.resolvedType !== 'COLOR') {
      answer(false, null, 'it is no longer a color variable in this file. Press Refresh.');
    } else if (!collection || !collection.modes.some((mode) => mode.modeId === msg.modeId)) {
      answer(false, null, 'its collection or mode no longer exists. Press Refresh.');
    } else {
      // In an extended collection this sets the override for the extension's mode.
      variable.setValueForMode(msg.modeId, color);
      // One undo step per edit, so Cmd+Z in Figma reverts exactly this change.
      figma.commitUndo();
      answer(true, vsToHex(color), '');
    }
  } catch (error) {
    answer(false, null, vsErrorText(error));
  }
  // Aliases elsewhere may point at this variable, so the whole list is read again.
  await vsPostVariables();
}

figma.ui.on('message', (msg: unknown) => {
  // kit:* messages and anything else this plugin does not know fall through untouched.
  if (vsIsObject(msg) && msg.type === 'load-variables') void vsPostVariables();
  else if (vsIsSetColorMessage(msg)) void vsSetColor(msg);
});

// The first list goes out at once; Figma queues it until the UI has loaded.
void vsPostVariables();
