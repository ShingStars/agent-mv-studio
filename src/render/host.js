/**
 * Browser host. Plain ES module: it imports the compiled engine from /dist and
 * either plays the film (preview) or answers frame requests over a WebSocket
 * (export). No bundler, no framework.
 */
import { Film } from '/dist/core/film.js';
import { loadFonts, fontReport } from '/dist/core/fonts.js';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'preview';
const styleName = q.get('style') ?? 'plate';
const planUrl = q.get('plan') ?? '/project/plan.json';
const wantW = Number(q.get('w')) || 0;
const wantH = Number(q.get('h')) || 0;
const noPost = q.get('nopost') === '1';

const canvas = document.getElementById('c');
const hud = document.getElementById('hud');
const stage = document.getElementById('stage');
const statusText = document.getElementById('status');

function showStatus(text) {
  if (statusText) statusText.textContent = text;
}

function fail(err) {
  const message = err && err.stack ? err.stack : String(err);
  console.error(message);
  showStatus('ERROR: ' + message);
  document.title = 'ERROR';
  window.__mv = { ready: false, error: message };
}

async function boot() {
  const plan = await (await fetch(planUrl, { cache: 'no-store' })).json();
  await loadFonts();
  const mod = await import(`/dist/styles/${styleName}/index.js`);
  const style = mod.style ?? mod[`${styleName}Style`];
  if (!style) throw new Error(`style module for ${styleName} exports nothing named "style"`);
  const width = wantW || plan.meta.width;
  const height = wantH || plan.meta.height;
  const film = await Film.create(canvas, plan, style, {
    width,
    height,
    fps: plan.meta.fps,
    noPost,
  });

  const api = {
    ready: true,
    width,
    height,
    fps: plan.meta.fps,
    preroll: plan.song.preroll,
    duration: plan.song.duration,
    title: plan.meta.title,
    style: styleName,
    shots: plan.shots.length,
    fonts: fontReport(),
    renderFrame(t) {
      film.renderFrame(t);
    },
    still(t, mime = 'image/png') {
      film.renderFrame(t);
      return canvas.toDataURL(mime);
    },
    /** RGBA bytes for the current canvas, for the WebSocket sink. */
    readRGBA() {
      const ctx = canvas.getContext('2d');
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    },
  };
  window.__mv = api;

  if (mode === 'preview') await preview(film, plan, api);
  else if (mode === 'export') await exportMode(film, plan, api);
  else if (mode === 'still') {
    const t = Number(q.get('t')) || 0;
    film.renderFrame(t);
    document.title = `STILL ${t}`;
    showStatus(`still t=${t}`);
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
}

async function preview(film, plan, api) {
  document.body.classList.add('preview');
  const audio = new Audio('/project/audio.wav');
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  let playing = false;
  let wallStart = performance.now();
  let t = 0;
  const preroll = plan.song.preroll;

  const seek = document.getElementById('seek');
  const btn = document.getElementById('play');
  seek.max = String(plan.song.duration);
  seek.value = '0';

  const setT = (next) => {
    t = Math.max(-preroll, Math.min(plan.song.duration, next));
    film.renderFrame(t);
    const shot = film.shotAt(t);
    hud.textContent = `${t.toFixed(2)}s  ·  ${shot.id}  ·  ${shot.scene}  ·  ${Math.round(1000 / Math.max(1, perf()))} ms/frame`;
    seek.value = String(t);
    showStatus(`${plan.meta.title} — ${t.toFixed(2)} / ${plan.song.duration.toFixed(2)}s`);
  };
  let last = performance.now();
  let smooth = 16;
  const perf = () => smooth;
  const frame = () => {
    const now = performance.now();
    smooth = smooth * 0.9 + (now - last) * 0.1;
    last = now;
    if (playing) {
      const songT = audio.readyState >= 2 && !audio.error ? audio.currentTime : (now - wallStart) / 1000;
      t = songT - preroll;
      if (t >= plan.song.duration) {
        playing = false;
        audio.pause();
        btn.textContent = '▶ replay';
        t = plan.song.duration;
      }
      film.renderFrame(t);
      const shot = film.shotAt(t);
      hud.textContent = `${t.toFixed(2)}s  ·  ${shot.id}  ·  ${shot.scene}  ·  ${smooth.toFixed(1)} ms/frame`;
      seek.value = String(Math.max(0, t));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const play = () => {
    if (t >= plan.song.duration - 0.05) {
      audio.currentTime = 0;
      t = -preroll;
    } else audio.currentTime = Math.max(0, t);
    audio.play().catch(() => {});
    wallStart = performance.now() - Math.max(0, t + preroll) * 1000;
    playing = true;
    btn.textContent = '❚❚ pause';
    stage.classList.add('playing');
    setT(t);
  };
  const pause = () => {
    audio.pause();
    playing = false;
    btn.textContent = '▶ play';
    stage.classList.remove('playing');
  };
  btn.addEventListener('click', () => (playing ? pause() : play()));
  seek.addEventListener('input', () => {
    const v = Number(seek.value);
    if (playing) audio.currentTime = Math.max(0, v);
    setT(v);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      playing ? pause() : play();
    } else if (e.code === 'ArrowRight') setT(t + 5);
    else if (e.code === 'ArrowLeft') setT(t - 5);
    else if (e.code === 'KeyD') hud.classList.toggle('hidden');
  });
  setT(-preroll);
  document.title = `preview — ${plan.meta.title}`;
  console.info('preview ready', api.fonts);
}

async function exportMode(film, plan, api) {
  document.body.classList.add('export');
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  let busy = false;

  const renderOne = (t) => {
    film.renderFrame(t);
    const rgba = api.readRGBA();
    return rgba.buffer;
  };

  ws.addEventListener('open', () => {
    document.title = 'EXPORT READY';
    showStatus('export channel open');
  });
  ws.addEventListener('error', (e) => fail(new Error('WebSocket error: ' + e.message)));
  ws.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string') return;
    const msg = JSON.parse(ev.data);
    if (msg.type === 'frame') {
      busy = true;
      try {
        const buf = renderOne(msg.t);
        ws.send(buf);
      } catch (err) {
        fail(err);
      } finally {
        busy = false;
      }
    } else if (msg.type === 'ping') ws.send('pong');
    else if (msg.type === 'bye') ws.close();
  });
  document.title = 'EXPORT READY';
  console.info('export ready', api.fonts, busy);
}

boot().catch(fail);
