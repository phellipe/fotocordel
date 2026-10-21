/* Locally synthesized waves; browser autoplay rules and the visitor's mute win. */
(() => {
  'use strict';

  const initialize = () => {
    const buttons = ['#sound-toggle', '#sound-dock-toggle', '#viewer-sound-toggle']
      .map(selector => document.querySelector(selector)).filter(Boolean);
    if (!buttons.length) return;

    const volumeControl = document.querySelector('#sound-volume');
    const sceneControl = document.querySelector('#sound-scene');
    const status = document.querySelector('#sound-status');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const preferenceKey = 'fotocordel.sound.muted';
    const readMuted = (fallback = false) => {
      try {
        const saved = window.localStorage.getItem(preferenceKey);
        return saved === null ? fallback : saved === 'true';
      } catch { return fallback; }
    };
    let context;
    let master;
    let lowpass;
    let highpass;
    let surge;
    let breath;
    let brightness;
    let enabled = !readMuted();
    let unavailable = !AudioContext;
    let suspendTimer;
    let revision = 0;
    let pageActive = true;
    let listeningForGesture = false;
    let touchStart;

    if (sceneControl) sceneControl.value = 'mar';
    if (volumeControl) volumeControl.value = '22';

    const announce = message => {
      if (status && status.textContent !== message) status.textContent = message;
    };
    const scene = () => sceneControl?.value === 'vento' ? 'vento' : 'mar';
    const volume = () => {
      const value = Number(volumeControl?.value ?? 22);
      return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 22)) / 100;
    };
    const shouldPlay = () => enabled && !unavailable && !document.hidden && pageActive;
    const playbackState = () => {
      if (unavailable) return 'unavailable';
      if (!enabled) return 'muted';
      return shouldPlay() && context?.state === 'running' ? 'playing' : 'waiting';
    };
    const savePreference = () => {
      try { window.localStorage.setItem(preferenceKey, String(!enabled)); } catch { /* Private browsing may deny storage. */ }
    };
    const gestureEvents = ['pointerdown', 'pointerup', 'keydown', 'click'];
    const setGestureListeners = active => {
      if (active === listeningForGesture) return;
      listeningForGesture = active;
      for (const type of gestureEvents) {
        if (active) document.addEventListener(type, unlock, { passive: true });
        else document.removeEventListener(type, unlock);
      }
    };
    const render = () => {
      const state = playbackState();
      const landscape = scene() === 'vento' ? 'vento' : 'mar';
      const labels = {
        playing: `Silenciar ${landscape}`,
        waiting: `Ativar som do ${landscape}`,
        muted: `Ouvir o ${landscape}`,
        unavailable: 'Som indisponível',
      };
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(enabled && !unavailable));
        button.setAttribute('data-sound-state', state);
        button.setAttribute('aria-label', labels[state]);
        button.disabled = unavailable;
        const label = button.querySelector('[data-sound-label]');
        if (label) label.textContent = labels[state];
      }
      if (volumeControl) volumeControl.disabled = unavailable;
      if (sceneControl) sceneControl.disabled = unavailable;
      setGestureListeners(state === 'waiting' && shouldPlay());
      if (unavailable) announce('Este navegador não oferece suporte ao som ambiente.');
      else if (!enabled) announce('Som silenciado. Você pode ativá-lo quando quiser.');
      else if (!shouldPlay()) announce('Som pausado enquanto a página está em segundo plano.');
      else if (state === 'playing') {
        announce(volume() === 0 ? 'Volume zerado. Aumente o volume para ouvir.' : `Som do ${landscape} ativado.`);
      } else announce(`O navegador aguarda um toque para liberar o som do ${landscape}.`);
    };
    const cancelSuspend = () => {
      window.clearTimeout(suspendTimer);
      suspendTimer = undefined;
    };
    const ramp = (parameter, value, duration = 0.18) => {
      const now = context.currentTime;
      if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
      else {
        const current = parameter.value;
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(current, now);
      }
      parameter.linearRampToValueAtTime(value, now + duration);
    };

    const applyScene = () => {
      if (!context) return;
      const wind = scene() === 'vento';
      ramp(lowpass.frequency, wind ? 1050 : 3100, 1.4);
      ramp(highpass.frequency, wind ? 240 : 85, 1.4);
      ramp(surge.frequency, wind ? 0.038 : 0.095, 1.4);
      ramp(breath.frequency, wind ? 0.13 : 0.033, 1.4);
      ramp(brightness.gain, wind ? 180 : 1050, 1.4);
    };

    const createSound = () => {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);

      // Two soft noise channels and slow, unequal swells avoid a mechanical pulse.
      const buffer = context.createBuffer(2, context.sampleRate * 12, context.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const samples = buffer.getChannelData(channel);
        let previous = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const white = Math.random() * 2 - 1;
          previous = (previous + white * 0.035) / 1.035;
          samples[i] = white * 0.22 + previous * 2.4;
        }
      }
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.Q.value = 0.4;
      highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.Q.value = 0.4;
      const swell = context.createGain();
      swell.gain.value = 0.48;

      surge = context.createOscillator();
      const surgeDepth = context.createGain();
      surgeDepth.gain.value = 0.31;
      surge.connect(surgeDepth).connect(swell.gain);
      breath = context.createOscillator();
      const breathDepth = context.createGain();
      breathDepth.gain.value = 0.09;
      breath.connect(breathDepth).connect(swell.gain);
      brightness = context.createGain();
      surge.connect(brightness).connect(lowpass.frequency);

      noise.connect(highpass).connect(lowpass).connect(swell).connect(master);
      applyScene();
      noise.start();
      surge.start();
      breath.start();
      context.addEventListener('statechange', () => {
        // An old pending resume may settle after mute or a tab switch.
        if (shouldPlay() && context.state === 'running') {
          cancelSuspend();
          ramp(master.gain, volume() * 0.5, 0.8);
        } else if (context.state === 'running') pause(true);
        render();
      });
    };

    const pause = (immediate = false) => {
      const currentRevision = ++revision;
      cancelSuspend();
      if (context) {
        ramp(master.gain, 0, immediate ? 0 : 0.25);
        const suspend = () => {
          suspendTimer = undefined;
          if (currentRevision === revision && context.state === 'running') {
            context.suspend().catch(() => {});
          }
        };
        if (immediate || context.state !== 'running') suspend();
        else suspendTimer = window.setTimeout(suspend, 300);
      }
      render();
    };

    const requestPlayback = () => {
      if (!shouldPlay()) { render(); return; }
      const currentRevision = ++revision;
      cancelSuspend();
      try {
        if (!context) createSound();
        if (context.state === 'closed') throw new Error('Audio context closed');
        if (context.state === 'running') ramp(master.gain, volume() * 0.5, 0.8);
        else {
          // Never await resume: some browsers leave autoplay promises pending.
          // Statechange is authoritative; another user gesture may retry immediately.
          context.resume().catch(() => {
            if (currentRevision === revision) render();
          });
        }
        render();
      } catch {
        unavailable = true;
        cancelSuspend();
        if (context) context.close().catch(() => {});
        render();
      }
    };

    function unlock(event) {
      if (!shouldPlay() || playbackState() === 'playing' || event.repeat) return;
      if (event.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(event.key)) return;
      if (event.type.startsWith('pointer') && event.button > 0) return;
      // The sound controls own their gesture, including the first click to mute.
      if (buttons.some(button => button.contains(event.target))) return;
      if (event.type === 'pointerdown' && event.pointerType !== 'mouse') {
        touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
        return;
      }
      if (event.type === 'pointerup' && event.pointerType !== 'mouse') {
        const start = touchStart;
        touchStart = undefined;
        if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
      }
      requestPlayback();
    }

    for (const button of buttons) {
      button.addEventListener('click', () => {
        if (unavailable) return;
        if (playbackState() === 'playing') {
          enabled = false;
          savePreference();
          pause();
        } else {
          enabled = true;
          savePreference();
          requestPlayback();
        }
      });
    }
    volumeControl?.addEventListener('input', () => {
      if (context && shouldPlay()) ramp(master.gain, volume() * 0.5);
      render();
    });
    sceneControl?.addEventListener('change', () => {
      applyScene();
      render();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause(true);
      else requestPlayback();
    });
    window.addEventListener('pagehide', () => {
      pageActive = false;
      pause(true);
    });
    window.addEventListener('pageshow', () => {
      pageActive = true;
      enabled = !readMuted(!enabled);
      requestPlayback();
    });
    window.addEventListener('storage', event => {
      if (event.key !== preferenceKey) return;
      enabled = !readMuted(!enabled);
      if (enabled) requestPlayback();
      else pause();
    });

    window.FotocordelSound = Object.freeze({
      get enabled() { return enabled && !unavailable; },
      get state() { return context?.state ?? 'uninitialized'; },
      get playbackState() { return playbackState(); },
      get scene() { return scene(); },
      get volume() { return volume(); },
    });
    render();
    requestPlayback();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else initialize();
})();
