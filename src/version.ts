declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/** Semantic version from package.json, e.g. "0.2.0". */
export const VERSION: string = __APP_VERSION__;
/** Short commit hash of this build, or '' when built outside git. */
export const COMMIT: string = __APP_COMMIT__;

/** "v0.2.0 (1a2b3c4)", shown on the main menu. */
export function versionLabel(version: string = VERSION, commit: string = COMMIT): string {
  return commit ? `v${version} (${commit})` : `v${version}`;
}
