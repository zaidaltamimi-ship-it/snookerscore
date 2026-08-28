// Native Android glue. Everything here degrades to a no-op in a normal browser,
// so the same build runs on the web and inside the Capacitor shell.
import { Capacitor } from '@capacitor/core';

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  window.__NATIVE__ = true;

  // Status bar: match the baize, light text.
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#082018' });
  } catch (e) { /* plugin absent */ }

  // Orientation control, used when the scoreboard goes fullscreen for a TV.
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    window.__ORIENT__ = (mode) => {
      if (mode === 'unlock') return ScreenOrientation.unlock();
      return ScreenOrientation.lock({ orientation: mode });
    };
  } catch (e) { /* plugin absent */ }

  // Hardware back button. A referee must never lose a frame to a stray back tap.
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      const s = window.__snooker;
      if (!s) return;
      if (s.hasModal()) return s.closeModal();
      if (s.isTV()) return s.exitTV();
      if (s.screen() === 'match') return s.goSetup(); // asks before discarding
      App.exitApp();
    });
  } catch (e) { /* plugin absent */ }

  // Hide the splash once the board is painted.
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (e) { /* plugin absent */ }
}
