import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SecretKeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}

/**
 * Поле секрета с локальным переключателем видимости.
 * Раньше два разных ключа делили один флаг showKey — открытие одного
 * показывало и второй. Заодно отключаем автокоррекцию: Android иначе
 * капитализирует первый символ ключа.
 */
export const SecretKeyField: React.FC<SecretKeyFieldProps> = ({
  value,
  onChange,
  placeholder,
  label = 'API Key',
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-zinc-300">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          className="w-full bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg px-3 py-2 pr-10 text-xs text-white placeholder-zinc-600 font-mono transition-colors"
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}
          aria-pressed={visible}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
        >
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
