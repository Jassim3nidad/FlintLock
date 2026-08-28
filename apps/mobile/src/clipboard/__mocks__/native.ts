/**
 * Jest test double for ./native — models Android 10+'s real behavior,
 * not just the happy path, so a test against this double actually proves
 * something about the retry-on-foreground leg of clipboard clearing.
 *
 * Android 10+ denies clipboard read AND write access to apps that don't
 * currently have focus (Google's stated rationale: preventing background
 * apps from silently harvesting or planting clipboard content) by
 * silently no-opping the underlying platform call — no exception, no
 * error, nothing for the calling library to surface. A mock that always
 * succeeds (the previous version of this file) would make a "retry on
 * next foreground" test pass whether or not the retry logic actually
 * works, since nothing in the test environment could ever demonstrate
 * the failure the retry exists to recover from.
 *
 * `__setFocused(false)` simulates the app being backgrounded (the
 * default is `true`, matching a normal foreground test run unless a
 * test explicitly opts into the backgrounded case).
 */
let value = '';
let focused = true;

export function __setFocused(isFocused: boolean): void {
  focused = isFocused;
}

export function __reset(): void {
  value = '';
  focused = true;
}

/**
 * Bypasses the focus gate entirely — reads the true underlying value
 * regardless of `focused`. For test assertions only: a real caller
 * (including the app under test) has no equivalent, since real Android
 * denies *it* too while unfocused. Use this to assert on ground truth
 * mid-test (e.g. "the denied write really didn't land"); use the gated
 * `Clipboard.getString()` for anything meant to represent what the app
 * itself could actually observe at that point.
 */
export function __peek(): string {
  return value;
}

export const Clipboard = {
  setString: async (content: string): Promise<void> => {
    if (!focused) return; // silent no-op, matching real Android 10+ denial
    value = content;
  },
  getString: async (): Promise<string> => {
    if (!focused) return ''; // background reads are denied the same way; never returns real content
    return value;
  },
};
