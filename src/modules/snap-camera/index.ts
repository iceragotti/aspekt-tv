import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type SnapCameraNativeModule = {
  triggerSnapFeedback: () => string;
};

const WEB_FALLBACK =
  'Snap feedback test is available only in the native iOS and Android builds.';

/**
 * Runs the native Snap Camera feedback test when available.
 * The web branch intentionally avoids resolving a native module.
 */
export function triggerSnapFeedback(): string {
  if (Platform.OS === 'web') {
    return WEB_FALLBACK;
  }

  const nativeModule =
    requireOptionalNativeModule<SnapCameraNativeModule>('SnapCamera');
  return (
    nativeModule?.triggerSnapFeedback() ??
    'Snap Camera native module is not installed in this build.'
  );
}

export default { triggerSnapFeedback };
