// The one round identity chip: the synced photo when there is one, initials otherwise.
import React from 'react';
import type { ProfileInfo } from '../../types';

function initialsFor(profile: ProfileInfo): string {
  const words = profile.name.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('');
  return letters.toUpperCase() || 'SL';
}

interface ProfileAvatarProps {
  profile: ProfileInfo;
  /** Box and type scale; the caller owns the geometry. */
  className?: string;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ profile, className = '' }) => (
  <span
    className={`flex items-center justify-center rounded-full overflow-hidden bg-tint-6 font-mono text-fg-muted select-none ${className}`}
  >
    {profile.avatar ? (
      <img src={profile.avatar} alt="" className="w-full h-full object-cover object-center" />
    ) : (
      initialsFor(profile)
    )}
  </span>
);
