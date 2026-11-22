export const FOLDED_QUOTE = '[!quote]-';
export const SPOILER_MARKER = '||';
export const FOLDED_QUOTE_PREFIX = `\n\n> ${FOLDED_QUOTE}\n> `;

// One delimiter rule for display and redaction. An unfinished spoiler ends at the line break.
const spoilerPattern = /\|\|([^\r\n]*?)(?:\|\||(?=\r?$))/gm;

export function withoutSpoilers(text: string): string {
  return text.replace(spoilerPattern, ' ');
}

type Node = {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  title?: string;
  children?: Node[];
  data?: { hName?: string; hProperties?: Record<string, string> };
};

const spoilerToken = /\uE000(\d+)\uE001/g;

export function protectSpoilers(text: string) {
  const spoilers: { source: string; body: string }[] = [];
  const markdown = text.replace(spoilerPattern, (source: string, body: string) => {
    const index = spoilers.push({ source, body }) - 1;
    return `\uE000${index}\uE001`;
  });
  const restore = (value: string) => value.replace(spoilerToken, (token, id) => spoilers[Number(id)]?.source ?? token);
  return { markdown, spoilers, restore };
}

export function remarkNoteDisclosure(spoilers: ReturnType<typeof protectSpoilers>['spoilers']) {
  return (root: Node) => {
    const restore = (value: string) => value.replace(spoilerToken, (token, id) => spoilers[Number(id)]?.source ?? token);
    const hide = (value: string) => value.replace(spoilerToken, (token, id) => spoilers[Number(id)] ? 'Спойлер' : token);
    function visit(node: Node, insideLink = false) {
      insideLink ||= node.type === 'link' || node.type === 'linkReference';
      if (node.url) node.url = restore(node.url);
      if (node.alt) node.alt = hide(node.alt);
      if (node.title) node.title = hide(node.title);
      if (node.type === 'blockquote') {
        const paragraph = node.children?.[0];
        const marker = paragraph?.type === 'paragraph' ? paragraph.children?.[0] : undefined;
        if (marker?.type === 'text' && marker.value?.split('\n')[0] === FOLDED_QUOTE) {
          marker.value = marker.value.slice(FOLDED_QUOTE.length).replace(/^\n/, '');
          if (!marker.value) paragraph?.children?.shift();
          if (!paragraph?.children?.length) node.children?.shift();
          node.data = { ...node.data, hName: 'details' };
        }
      }
      if (node.children) node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value?.includes('\uE000') || insideLink) {
          if (child.value) child.value = insideLink ? hide(child.value) : restore(child.value);
          visit(child, insideLink);
          return [child];
        }
        const parts: Node[] = [];
        let end = 0;
        for (const match of child.value.matchAll(spoilerToken)) {
          const spoiler = spoilers[Number(match[1])];
          if (!spoiler) continue;
          if (match.index > end) parts.push({ type: 'text', value: child.value.slice(end, match.index) });
          parts.push({
            type: 'noteSpoiler',
            children: [{ type: 'text', value: spoiler.body }],
            data: { hName: 'span', hProperties: { 'data-note-spoiler': '' } },
          });
          end = match.index + match[0].length;
        }
        if (end < child.value.length) parts.push({ type: 'text', value: child.value.slice(end) });
        return parts;
      });
    }
    visit(root);
  };
}
