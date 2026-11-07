import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SecretKeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Doubles as the field's only label, so it states what to paste and its prefix. */
  placeholder: string;
}

/**
 * A secret, rendered as one settings row: the input is the row.
 * The separate label + bordered box made the group look like a card inside a
 * card, and cost a line for a word the placeholder already says.
 *
 * Visibility is per field: two keys sharing one flag revealed both at once.
 * Autocorrect is off because Android otherwise capitalises the first character
 * of a key.
 */
export const SecretKeyField: React.FC<SecretKeyFieldProps> = ({ value, onChange, placeholder }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        className="flex-1 min-w-0 bg-transparent text-xs font-mono text-fg-primary placeholder:text-fg-dim outline-none truncate"
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}
        aria-pressed={visible}
        className="p-1 shrink-0 text-fg-dim hover:text-fg-muted cursor-pointer"
      >
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
