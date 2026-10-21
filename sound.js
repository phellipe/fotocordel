/* A small, locally synthesized soundscape. Audio starts only after a click. */
(() => {
  'use strict';

  const initialize = () => {
    const button = document.querySelector('#sound-toggle');
    if (!button) return;

    const label = button.querySelector('[data-sound-label]');
    const volumeControl = document.querySelector('#sound-volume');
    const sceneControl = document.querySelector('#sound-scene');
    const status = document.querySelector('#sound-status');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let context;
    let master;
    let lowpass;
    let highpass;
    let surge;
    let breath;
    let enabled = false;
    let suspendTimer;
    let revision = 0;
    let pageActive = true;

    const announce = message => { if (status) status.textContent = message; };
    const scene = () => sceneControl?.value === 'vento' ? 'vento' : 'mar';
    const volume = () => {
      const value = Number(volumeControl?.value ?? 30);
      return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 30)) / 100;
    };
    const render = () => {
      button.setAttribute('aria-pressed', String(enabled));
      if (label) label.textContent = enabled ? 'Desligar som' : 'Ouvir a paisagem';
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
    };

    const createSound = () => {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);

      // Long noise buffer, filtered and slowly modulated to suggest waves or wind.
      const buffer = context.createBuffer(1, context.sampleRate * 12, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const white = Math.random() * 2 - 1;
        previous = (previous + white * 0.035) / 1.035;
        samples[i] = white * 0.22 + previous * 2.4;
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

      noise.connect(highpass).connect(lowpass).connect(swell).connect(master);
      applyScene();
      noise.start();
      surge.start();
      breath.start();
    };

    const synchronize = async (immediate = false) => {
      const currentRevision = ++revision;
      cancelSuspend();
      if (!context) return;
      const shouldPlay = enabled && !document.hidden && pageActive;
      if (shouldPlay) {
        try {
          await context.resume();
          if (currentRevision !== revision) return;
          if (context.state !== 'running') throw new Error('Audio paused');
          ramp(master.gain, volume() * 0.5, 0.8);
          announce(scene() === 'mar' ? 'Som do mar ativado.' : 'Som do vento ativado.');
        } catch {
          if (currentRevision !== revision) return;
          enabled = false;
          render();
          announce('O áudio foi pausado pelo navegador. Toque em Ouvir a paisagem para tentar novamente.');
        }
      } else {
        ramp(master.gain, 0, immediate ? 0 : 0.25);
        const suspend = () => {
          suspendTimer = undefined;
          if (currentRevision === revision && context.state !== 'closed') {
            context.suspend().catch(() => {});
          }
        };
        if (immediate || context.state !== 'running') suspend();
        else suspendTimer = window.setTimeout(suspend, 300);
        announce(enabled ? 'Som pausado enquanto a página está em segundo plano.' : 'Som desligado.');
      }
    };

    render();
    if (!AudioContext) {
      button.disabled = true;
      if (volumeControl) volumeControl.disabled = true;
      if (sceneControl) sceneControl.disabled = true;
      if (label) label.textContent = 'Som indisponível';
      announce('Este navegador não oferece suporte ao som ambiente.');
      return;
    }

    button.addEventListener('click', () => {
      try {
        if (!context) createSound();
        enabled = !enabled;
        render();
        void synchronize();
      } catch {
        enabled = false;
        render();
        announce('Não foi possível iniciar o som neste navegador.');
      }
    });
    volumeControl?.addEventListener('input', () => {
      if (context && enabled && !document.hidden && pageActive) {
        ramp(master.gain, volume() * 0.5);
      }
    });
    sceneControl?.addEventListener('change', () => {
      applyScene();
      if (enabled && !document.hidden && pageActive) {
        announce(scene() === 'mar' ? 'Som do mar ativado.' : 'Som do vento ativado.');
      }
    });
    document.addEventListener('visibilitychange', () => { void synchronize(document.hidden); });
    window.addEventListener('pagehide', () => {
      pageActive = false;
      void synchronize(true);
    });
    window.addEventListener('pageshow', () => {
      pageActive = true;
      if (enabled) void synchronize();
    });

    window.FotocordelSound = Object.freeze({
      get enabled() { return enabled; },
      get state() { return context?.state ?? 'uninitialized'; },
      get scene() { return scene(); },
      get volume() { return volume(); },
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else initialize();
})();
