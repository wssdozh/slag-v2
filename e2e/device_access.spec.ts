import { test, expect } from '@playwright/test';
import {
  accessActionLabel,
  accessStateLabel,
  accessValue,
} from '../src/components/Settings/notifications/accessCopy';
import { shouldResumeInstall } from '../src/lib/platform/installResume';

// No device is attached, so the parts that can be wrong without one are tested here: how a grant
// reads, and the once-per-offer resume of an apk install. The native switch itself is untested.

test.describe('Android permissions copy', () => {
  test('a grant reads as allowed or not; unknown stays a dash', () => {
    expect(accessStateLabel(true)).toBe('разрешено');
    expect(accessStateLabel(false)).toBe('не разрешено');
    expect(accessStateLabel(null)).toBe('—');
  });

  test('the action asks only while the grant is missing', () => {
    expect(accessActionLabel(false)).toBe('разрешить');
    expect(accessActionLabel(true)).toBe('настройки');
    expect(accessActionLabel(null)).toBe('настройки');
  });

  test('each row reads its own field off the native status', () => {
    const status = { overlay: true, notifications: false, fullScreenIntent: true };
    expect(accessValue(status, 'overlay')).toBe(true);
    expect(accessValue(status, 'notifications')).toBe(false);
    expect(accessValue(status, 'fullScreen')).toBe(true);
    expect(accessValue(null, 'overlay')).toBeNull();
  });
});

test.describe('apk install resume', () => {
  const blocked = {
    pendingVersion: '0.3.0',
    offerVersion: '0.3.0',
    resumedVersion: null,
    canInstallPackages: true,
  };

  test('resumes once the permission is known to be granted', () => {
    expect(shouldResumeInstall(blocked)).toBe(true);
  });

  test('does not resume on a refused or unreadable permission', () => {
    expect(shouldResumeInstall({ ...blocked, canInstallPackages: false })).toBe(false);
    expect(shouldResumeInstall({ ...blocked, canInstallPackages: null })).toBe(false);
  });

  test('does not resume twice for the same offer', () => {
    expect(shouldResumeInstall({ ...blocked, resumedVersion: '0.3.0' })).toBe(false);
  });

  test('does not resume an offer that is no longer on screen', () => {
    expect(shouldResumeInstall({ ...blocked, offerVersion: '0.4.0' })).toBe(false);
    expect(shouldResumeInstall({ ...blocked, offerVersion: null })).toBe(false);
    expect(shouldResumeInstall({ ...blocked, pendingVersion: null })).toBe(false);
  });
});
