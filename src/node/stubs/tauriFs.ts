// Logs on disk go through plugin-fs in the browser build. A server writes them to the journal,
// so every call here is a no-op that keeps the import graph resolvable.
export const BaseDirectory = { AppData: 0 } as const;

export async function mkdir(): Promise<void> {
  // Journal already has the directories.
}

export async function writeTextFile(): Promise<void> {
  // stdio is the log sink on the node.
}

export async function readDir(): Promise<never[]> {
  return [];
}

export async function remove(): Promise<void> {
  // Nothing was written.
}
