// Tones for the storage ring: one token pair per sector, no colour invented in a component.

/**
 * Six kinds, six existing tokens: the ring reads at a glance, and no colour is invented here.
 * Media gets the loud hues, plain data and snapshots stay in the grey/amber register.
 */
export const SEGMENT_TONE: Record<string, { stroke: string; dot: string }> = {
  video: { stroke: 'stroke-accent', dot: 'bg-accent' },
  image: { stroke: 'stroke-success', dot: 'bg-success' },
  audio: { stroke: 'stroke-mention', dot: 'bg-mention' },
  file: { stroke: 'stroke-fg-muted', dot: 'bg-fg-muted' },
  data: { stroke: 'stroke-fg-secondary', dot: 'bg-fg-secondary' },
  snapshots: { stroke: 'stroke-warning', dot: 'bg-warning' },
};

export const toneOf = (id: string) => SEGMENT_TONE[id] ?? SEGMENT_TONE.data;

/** Only the media sectors carry a test hook; data and snapshots are not files. */
export const MEDIA_SEGMENT_IDS = new Set(['image', 'audio', 'video', 'file']);
