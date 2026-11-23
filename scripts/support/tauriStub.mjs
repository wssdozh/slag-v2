// What a headless writer sees instead of Tauri: nothing it calls matters for disk-side tests.
export const isTauri = () => false;
export async function invoke() { return undefined; }
export const BaseDirectory = { AppData: 14, AppConfig: 15, AppLocalData: 16, Home: 1 };
export async function readTextFile() { return ''; }
export async function writeTextFile() {}
export async function mkdir() {}
export async function readDir() { return []; }
export async function remove() {}
export async function exists() { return false; }
export async function rename() {}
export const appDataDir = async () => '/tmp';
