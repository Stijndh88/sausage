import { guessLayoutFromLanguage, keyLabel, layoutFromMap, moveKeysLabel, type Bindings, type LayoutName } from '../state/controls';

/**
 * Detects the keyboard layout once at boot, only to show the right letters (controls work by
 * physical key position regardless). Chrome/Edge expose the real layout via
 * navigator.keyboard.getLayoutMap(); elsewhere we guess from the browser language.
 */
let layout: LayoutName = guessLayoutFromLanguage(globalThis.navigator?.language);
let map: Map<string, string> | null = null;
let source: 'browser' | 'language' = 'language';

interface KeyboardWithLayout {
  getLayoutMap(): Promise<Iterable<[string, string]>>;
}

export const layoutReady: Promise<void> = (async () => {
  try {
    const kb = (globalThis.navigator as unknown as { keyboard?: KeyboardWithLayout } | undefined)?.keyboard;
    if (!kb?.getLayoutMap) return;
    const m = new Map<string, string>(await kb.getLayoutMap());
    if (!m.size) return;
    map = m;
    layout = layoutFromMap(m);
    source = 'browser';
  } catch {
    // Not allowed (e.g. in an iframe) or not supported: keep the language guess.
  }
})();

export function currentLayout(): { name: LayoutName; source: 'browser' | 'language' } {
  return { name: layout, source };
}

export function labelForCode(code: string): string {
  return keyLabel(code, layout, map);
}

export function moveLabel(b: Readonly<Bindings>): string {
  return moveKeysLabel(b, layout, map);
}

/** For tests: pretend the browser reported this layout. */
export function overrideLayout(name: LayoutName, m: Map<string, string> | null = null): void {
  layout = name;
  map = m;
  source = m ? 'browser' : 'language';
}
