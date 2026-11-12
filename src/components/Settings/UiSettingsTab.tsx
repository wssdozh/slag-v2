import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { UiAccent } from '../../types';
import { FONT_SCALE_OPTIONS, FONT_FAMILY_OPTIONS } from '../../config/typography';
import { ACCENT_COLORS } from '../../config';
import { MobileDockSettings } from './MobileDockSettings';
import {
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
  SettingsSelect,
} from './SettingsUI';

const DENSITY_OPTIONS = [
  { value: 'compact' as const, label: 'Компактный' },
  { value: 'normal' as const, label: 'Стандарт' },
  { value: 'spacious' as const, label: 'Просторный' },
];

export const UiSettingsTab: React.FC = () => {
  const {
    uiConfig,
    updateUiConfig,
    isMobile,
    setSidebarWidth,
    setRightPanelWidth,
    addToast,
  } = useApp();
  const [selectedDevice, setSelectedDevice] = useState<'desktop' | 'mobile'>(isMobile ? 'mobile' : 'desktop');

  const resetPanelSizes = () => {
    setSidebarWidth(256);
    setRightPanelWidth(288);
    addToast('Размеры панелей сброшены', 'info');
  };

  return (
    <div className="flex flex-col gap-3">
      {!isMobile && (
        <SettingsGroup title="Профиль интерфейса">
          <SettingsSelect label="Устройство" value={selectedDevice} onChange={(device) => setSelectedDevice(device as typeof selectedDevice)} options={[{ value: 'desktop', label: 'Десктоп' }, { value: 'mobile', label: 'Смартфон' }]} />
        </SettingsGroup>
      )}

      {/* Typography & accent */}
      <SettingsGroup title="Оформление">
        <SettingsSelect
          label="Масштаб"
          testId="font-scale-select"
          value={uiConfig[selectedDevice].fontScale}
          onChange={(scaleKey) => updateUiConfig(selectedDevice, { fontScale: scaleKey as keyof typeof FONT_SCALE_OPTIONS })}
          options={(Object.keys(FONT_SCALE_OPTIONS) as Array<keyof typeof FONT_SCALE_OPTIONS>).map(key => ({
            value: key,
            label: `${FONT_SCALE_OPTIONS[key].label} (${FONT_SCALE_OPTIONS[key].percentage})`,
          }))}
        />
        <SettingsDivider />
        <SettingsSelect
          label="Гарнитура"
          value={uiConfig[selectedDevice].fontFamily || 'inter'}
          onChange={(famKey) => updateUiConfig(selectedDevice, { fontFamily: famKey as keyof typeof FONT_FAMILY_OPTIONS })}
          options={(Object.keys(FONT_FAMILY_OPTIONS) as Array<keyof typeof FONT_FAMILY_OPTIONS>).map(key => ({
            value: key,
            label: FONT_FAMILY_OPTIONS[key].label,
          }))}
        />
        <SettingsDivider />
        <SettingsSelect
          label="Плотность сетки"
          testId="density-select"
          value={uiConfig[selectedDevice].density}
          onChange={(density) => updateUiConfig(selectedDevice, { density: density as typeof uiConfig[typeof selectedDevice]['density'] })}
          options={DENSITY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
        <SettingsDivider />
        {/* The swatch paints preset data, not a literal invented here. */}
        <SettingsSelect
          label="Акцентный цвет"
          testId="accent-select"
          value={uiConfig[selectedDevice].accent}
          onChange={(accent) => updateUiConfig(selectedDevice, { accent: accent as UiAccent })}
          options={(Object.keys(ACCENT_COLORS) as UiAccent[]).map((key) => ({
            value: key,
            label: ACCENT_COLORS[key].label,
            icon: (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border border-white/25"
                style={{ backgroundColor: ACCENT_COLORS[key].hex }}
              />
            ),
          }))}
        />
      </SettingsGroup>

      {isMobile && <MobileDockSettings />}

      {!isMobile && (
        <>
          <SettingsGroup title="Предпросмотр">
            <div className="flex flex-col gap-2 px-4 py-3 select-none">
              <span className="text-base font-medium text-fg-primary">Заголовок заметки или ключевая задача</span>
              <p className="text-sm leading-relaxed text-fg-secondary">Основной текст заметки с комфортным размером и межстрочным интервалом для чтения.</p>
              <span className="text-2xs text-fg-muted">Входящие · #дизайн #типографика</span>
            </div>
          </SettingsGroup>
          <SettingsGroup title="Панели">
            <SettingsRow label="Сбросить размеры" onClick={resetPanelSizes} />
          </SettingsGroup>
        </>
      )}
    </div>
  );
};
