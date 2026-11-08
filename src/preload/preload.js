'use strict';

/*
 * Preload bridge shared by the overlay and settings windows.
 * Exposes a small, explicit API as `window.overlayAPI` (no Node access in renderers).
 */

const { contextBridge, ipcRenderer } = require('electron');

function on(channel) {
  return (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('overlayAPI', {
  mode: 'electron',
  platform: process.platform,

  getSettings: invoke('settings:get'),
  setSetting: invoke('settings:set'),
  resetSettings: invoke('settings:reset'),
  exportSettings: invoke('settings:export'),
  importSettings: invoke('settings:import'),

  applyTheme: invoke('theme:apply'),
  setThemeValue: invoke('theme:set'),
  resetThemeOverrides: invoke('theme:reset-overrides'),
  saveCustomTheme: invoke('theme:save-custom'),
  deleteCustomTheme: invoke('theme:delete-custom'),
  exportTheme: invoke('theme:export'),
  importTheme: invoke('theme:import'),

  getPlayback: invoke('playback:get'),
  getPreview: invoke('preview:get'),
  getAuthStatus: invoke('auth:status'),
  login: invoke('auth:login'),
  logout: invoke('auth:logout'),

  getOverlayVisible: invoke('overlay:visible-get'),
  setOverlayVisible: invoke('overlay:visible-set'),
  resetOverlayPosition: invoke('overlay:reset-position'),
  resizeOverlay: (width, height) => ipcRenderer.send('overlay:resize', { width, height }),

  getObsStatus: invoke('obs:status'),
  getShortcutStatus: invoke('shortcuts:status'),
  openConfigFolder: invoke('app:open-config'),
  openExternal: invoke('app:open-external'),
  getAppInfo: invoke('app:info'),

  onSettings: on('settings'),
  onPlayback: on('playback'),
  onAuth: on('auth'),
  onPreview: on('preview'),
  onObsStatus: on('obs-status'),
  onShortcutStatus: on('shortcuts-status'),
  onOverlayVisible: on('overlay-visible')
});
