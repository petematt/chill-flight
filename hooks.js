// --- LATE-BOUND HOOKS ---
// Lets a module call into one that loads after it, without an import cycle.
// The later module assigns its implementation here when it loads; callers
// check for it before use, e.g. `hooks.fullscreenMap?.isOpen()`.
export const hooks = {
  togglePause: null, // game-state.js
  openVRPauseMenu: null, // vr-manager.js
  closeVRPauseMenu: null, // vr-manager.js
  resetSteering: null, // game-ui.js
  onTrackChange: null, // game-audio-integration.js: (trackName) => void
  fullscreenMap: null, // minimap.js: {open, close, toggle, isOpen, syncUrlParams}
  minimap: null, // minimap.js: {toggle, isVisible}
  clearFarTerrain: null, // far-terrain.js: drops the distant terrain ring
  onResume: null, // zen.js: called when flight starts or the game unpauses
  onJobProgress: null, // people-screen.js: called by jobs.js when progress changes
  movePlane: null, // minimap.js: (x, y, z, yaw?, speed?) moves the plane there
  parkBuggy: null, // buggy.js: sets the buggy down where it is, stopped
  syncSmokeUI: null, // game-ui.js: updates the smoke button when forced on/off
  inGameMode: null, // multiplayer.js: () => whether tag or a race is on
  toggleAutopilot: null, // game-ui.js: (on?) => void
  setZen: null, // zen.js: (on) => void
  isZen: null, // zen.js: () => whether zen is on
  checkDiveCrash: null, // crash.js: (pitch, kts, verticalVelocity) => boolean
  forEachBalloon: null, // balloons.js: (fn) => void
  onBackground: null, // analytics.js: called when mobile app is backgrounded
  onForeground: null, // analytics.js: called when mobile app comes back
};
