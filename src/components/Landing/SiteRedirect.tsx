// `?page=landing` used to be a full marketing page inside the app build. The site now lives in
// its own repository, so this route is a signpost: old links and the admin header must not
// dead-end, and nothing here may pretend to download a file.
import React from 'react';
import { ArrowUpRight, UserRound } from 'lucide-react';
import { openExternalUrl } from '../../lib/platform/openExternal';
import { SITE_URL } from '../../config/site';

interface SiteRedirectProps {
  onNavigateToAccount?: () => void;
}

export const SiteRedirect: React.FC<SiteRedirectProps> = ({ onNavigateToAccount }) => (
  <div className="min-h-screen bg-canvas-subtle text-fg-primary flex items-center justify-center px-6 font-sans antialiased">
    <div className="w-full max-w-sm flex flex-col items-center text-center gap-5">
      <img
        src="/mascot-blueberry.svg"
        alt="SLAG"
        className="w-12 h-12 rounded-xl bg-surface border border-border-subtle p-1.5"
      />

      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold tracking-tight">SLAG живёт на slag.app</h1>
        <p className="text-xs text-fg-secondary leading-relaxed">
          Скачивание, тарифы, документация и баги переехали на отдельный сайт.
          Кабинет остался здесь.
        </p>
      </div>

      <div className="w-full flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void openExternalUrl(SITE_URL)}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-fg-primary text-canvas text-xs font-semibold rounded-lg hover:bg-fg-secondary motion-press cursor-pointer"
        >
          <span>Открыть slag.app</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
        {onNavigateToAccount && (
          <button
            type="button"
            onClick={onNavigateToAccount}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface text-fg-secondary hover:text-fg-primary border border-border-subtle text-xs font-medium rounded-lg motion-press cursor-pointer"
          >
            <UserRound className="w-3.5 h-3.5" />
            <span>Личный кабинет</span>
          </button>
        )}
      </div>

      <span className="font-mono text-[10px] text-fg-muted">{SITE_URL}</span>
    </div>
  </div>
);
