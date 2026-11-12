// Routes keydown through the APP_COMMANDS catalogue and the top-layer Escape.
import { useEffect, useRef } from 'react';
import { APP_COMMANDS, type AppCommandContext, matchesShortcut, isTypingTarget } from '../../lib/commands';

export function useGlobalHotkeys(
  context: AppCommandContext & { dismissTopLayer: () => boolean }
) {
  const contextRef = useRef(context);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctx = contextRef.current;

      // 1. Escape
      if (e.key === 'Escape') {
        if (ctx.dismissTopLayer()) {
          e.preventDefault();
          return;
        }
      }

      // 2. APP_COMMANDS
      for (const cmd of APP_COMMANDS) {
        if (!cmd.shortcut) continue;

        if (matchesShortcut(e, cmd.shortcut) || (cmd.aliases && cmd.aliases.some(a => matchesShortcut(e, a)))) {
          // Check input guard
          if (cmd.allowInInput === false && isTypingTarget(e.target)) {
            continue;
          }

          // Check isEnabled
          if (cmd.isEnabled && !cmd.isEnabled(ctx)) {
            continue;
          }

          // Run command
          const result = cmd.run(ctx);
          if (result !== false) {
            e.preventDefault();
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
