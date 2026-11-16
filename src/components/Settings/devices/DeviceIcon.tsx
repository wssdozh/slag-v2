// The glyph a device row wears: one distinct mark per form factor, never the same laptop twice.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { IconName } from '../../UI/icons/icons';
import { deviceKind, type DeviceKind } from '../../../lib/sync/deviceKind';

const ICON_BY_KIND: Record<DeviceKind, IconName> = {
  phone: 'entity.phone',
  tablet: 'entity.tablet',
  laptop: 'entity.desktop', // the registry's `entity.desktop` is the laptop glyph
  desktop: 'entity.computer',
  web: 'entity.browser',
  unknown: 'entity.deviceUnknown',
};

export const DeviceIcon: React.FC<{ platform: string | null | undefined }> = ({ platform }) => {
  const icon = ICON_BY_KIND[deviceKind(platform)];
  // `data-icon` lets a test read the chosen glyph without looking at pixels; the span is inert
  // to assistive tech, the glyph stays decorative next to the device name.
  return (
    <span data-icon={icon} className="flex">
      <Icon name={icon} size="md" tone="inherit" />
    </span>
  );
};
