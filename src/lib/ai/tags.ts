// Tag spelling rules shared by note triage and assistant memory: one dictionary, one casing.
import { AI_STOP_TAGS } from '../../config';

const STOP_TAGS = AI_STOP_TAGS;

export type TagStyle = 'lowercase' | 'kebab-case';

export function isStopTag(tag: string): boolean {
  const normalized = tag.toLowerCase().replace(/^#/, '').trim();
  return STOP_TAGS.has(normalized);
}

export function formatTag(tag: string, style: TagStyle): string {
  let clean = tag.toLowerCase().replace(/^#/, '').trim();
  if (style === 'kebab-case') {
    clean = clean.replace(/\s+/g, '-');
  }
  return clean;
}
