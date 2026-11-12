// Splits an assistant reply into markdown and fenced task blocks the chat renders as cards.
export type ChatSegment = 
  | { kind: "markdown"; text: string } 
  | { kind: "task"; title: string; lines: string[] };

export function splitTaskBlocks(content: string): ChatSegment[] {
  const segments: ChatSegment[] = [];
  const lines = content.split('\n');
  
  let inTaskBlock = false;
  let taskLang = "";
  let taskTitle: string | null = null;
  let taskLines: string[] = [];
  let buffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const rest = trimmed.slice(3).trim().toLowerCase();
      
      if (!inTaskBlock && (rest === "task" || rest === "todo")) {
        inTaskBlock = true;
        taskLang = trimmed.slice(3).trim();
        
        // flush accumulated markdown
        if (buffer.length > 0) {
          segments.push({ kind: "markdown", text: buffer.join('\n') });
          buffer = [];
        }
        
        taskTitle = null;
        taskLines = [];
        continue;
      } else if (inTaskBlock && trimmed === "```") {
        // end of task block
        segments.push({ kind: "task", title: taskTitle ?? "Таска", lines: taskLines });
        inTaskBlock = false;
        continue;
      }
    }

    if (inTaskBlock) {
      if (taskTitle === null) {
        taskTitle = line;
      } else {
        taskLines.push(line);
      }
    } else {
      buffer.push(line);
    }
  }

  // flush remaining
  if (inTaskBlock) {
    // Treat unclosed task fence as markdown
    const unclosedLines = ["```" + taskLang];
    if (taskTitle !== null) {
      unclosedLines.push(taskTitle);
    }
    if (taskLines.length > 0) {
      unclosedLines.push(...taskLines);
    }
    segments.push({ kind: "markdown", text: unclosedLines.join('\n') });
  } else if (buffer.length > 0) {
    segments.push({ kind: "markdown", text: buffer.join('\n') });
  }

  return segments;
}
