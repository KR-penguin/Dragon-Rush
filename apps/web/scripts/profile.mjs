#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const HELP = `Profile Dragon Rush in a running Vite development server.

Usage: pnpm profile:web [options]

  --url URL          Vite URL (default http://127.0.0.1:5173)
  --out DIR          Artifact directory (default a new directory under the OS temp directory)
  --label NAME       Artifact filename prefix (default profile)
  --cpu NUMBER       CPU throttling rate, at least 1 (default 4; --cpu4 also works)
  --seconds NUMBER   Seconds per scene, 0.1 through 30 (default 4; --seconds4 also works)
  --cdp URL|PORT     Use an existing Chrome debug endpoint instead of launching Chrome
  --keep-handoff     Keep the initial handoff dialog, matching the historical temporary harness
  --profile          Save a raw JavaScript CPU profile for the live dragon scene
  --fight-bench      Also compare synchronous and Worker bot-fight preparation, without rendering
  --no-sandbox       Pass --no-sandbox to an owned Chrome process when required by a container
  --help             Show this help

Without --cdp, CHROME_BIN selects the executable (default google-chrome).
Every run owns an isolated browser context and tab; existing Chrome tabs are never closed.
The script does not start, restart, or force-optimize Vite. No packages are required.
Artifacts: NAME.json, NAME-board.png, NAME.png, and optionally NAME.cpuprofile.
`;

function optionsFrom(args) {
  const options = {
    url: 'http://127.0.0.1:5173',
    out: join(tmpdir(), `dragon-rush-profile-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    label: 'profile',
    cpu: 4,
    seconds: 4,
    cdp: null,
    keepHandoff: false,
    profile: false,
    fightBench: false,
    noSandbox: false,
  };
  const flags = new Map([
    ['--keep-handoff', 'keepHandoff'],
    ['--profile', 'profile'],
    ['--fight-bench', 'fightBench'],
    ['--no-sandbox', 'noSandbox'],
  ]);
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--help' || argument === '-h') return null;
    if (flags.has(argument)) {
      options[flags.get(argument)] = true;
      continue;
    }
    const attached = argument.match(/^--(cpu|seconds|cdp)(\d+(?:\.\d+)?)$/);
    const [key, inline] = attached ? [`--${attached[1]}`, attached[2]] : argument.split('=', 2);
    if (!['--url', '--out', '--label', '--cpu', '--seconds', '--cdp'].includes(key))
      throw new Error(`Unknown option: ${argument}`);
    const value = inline ?? args[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key.slice(2)] = key === '--cpu' || key === '--seconds' ? Number(value) : value;
  }
  if (!Number.isFinite(options.cpu) || options.cpu < 1) throw new Error('--cpu must be at least 1');
  if (!Number.isFinite(options.seconds) || options.seconds < 0.1 || options.seconds > 30)
    throw new Error('--seconds must be between 0.1 and 30');
  if (!/^[a-zA-Z0-9_-]+$/.test(options.label))
    throw new Error('--label must use letters, digits, _ or -');
  const url = new globalThis.URL(options.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('--url must be an HTTP(S) URL');
  options.url = url.href;
  options.out = resolve(options.out);
  if (options.cdp) {
    if (/^\d+$/.test(options.cdp)) options.cdp = `http://127.0.0.1:${options.cdp}`;
    const cdp = new globalThis.URL(options.cdp);
    if (!['http:', 'https:'].includes(cdp.protocol))
      throw new Error('--cdp must be an HTTP(S) endpoint or port');
    options.cdp = cdp.href;
  }
  return options;
}

async function connectCdp(url, onEvent = () => {}) {
  const socket = new globalThis.WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error(`Cannot connect to Chrome at ${url}`)),
      { once: true },
    );
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) {
      onEvent(message);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    globalThis.clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      globalThis.clearTimeout(request.timeout);
      request.reject(new Error(`Chrome connection closed during ${request.method}`));
    }
    pending.clear();
  });
  return {
    call(method, params = {}) {
      if (socket.readyState !== globalThis.WebSocket.OPEN)
        return Promise.reject(new Error('Chrome connection is closed'));
      return new Promise((resolveCall, reject) => {
        const id = ++nextId;
        const timeout = globalThis.setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome command timed out: ${method}`));
        }, 30000);
        pending.set(id, { method, timeout, resolve: resolveCall, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

async function launchChrome(options, pause) {
  const directory = await mkdtemp(join(tmpdir(), 'dragon-rush-chrome-'));
  const child = spawn(
    process.env.CHROME_BIN ?? 'google-chrome',
    [
      '--headless=new',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${directory}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(options.noSandbox ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  let launchError = null;
  child.stderr.on('data', (data) => {
    stderr = (stderr + String(data)).slice(-16000);
  });
  child.on('error', (error) => {
    launchError = error;
  });
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  const close = async () => {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(2000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await Promise.race([exited, sleep(2000)]);
    }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
      const portFile = await readFile(join(directory, 'DevToolsActivePort'), 'utf8').catch(
        () => null,
      );
      const port = Number(portFile?.split('\n')[0]);
      if (Number.isInteger(port) && port > 0)
        return { endpoint: `http://127.0.0.1:${port}`, close };
      await pause(50);
    }
    throw new Error(`Chrome did not expose a debug endpoint. ${stderr}`);
  } catch (error) {
    await close();
    throw error;
  }
}

async function run(options) {
  const abort = new globalThis.AbortController();
  const pause = (ms) => sleep(ms, undefined, { signal: abort.signal });
  let browser = null;
  let page = null;
  let owned = null;
  let contextId = null;
  let targetId = null;
  const browserErrors = [];
  const interrupted = () => {
    abort.abort();
    page?.close();
    browser?.close();
  };
  process.on('SIGINT', interrupted);
  process.on('SIGTERM', interrupted);
  try {
    const vite = await globalThis.fetch(new globalThis.URL('/@vite/client', options.url), {
      signal: abort.signal,
    });
    if (!vite.ok || !(await vite.text()).includes('createHotContext'))
      throw new Error(
        'This profiler requires a running Vite development server; start pnpm dev first',
      );
    if (!options.cdp) owned = await launchChrome(options, pause);
    const endpoint = options.cdp ?? owned.endpoint;
    const version = await (
      await globalThis.fetch(new globalThis.URL('/json/version', endpoint))
    ).json();
    browser = await connectCdp(version.webSocketDebuggerUrl);
    const system = await browser.call('SystemInfo.getInfo').catch(() => null);
    ({ browserContextId: contextId } = await browser.call('Target.createBrowserContext', {
      disposeOnDetach: true,
    }));
    ({ targetId } = await browser.call('Target.createTarget', {
      url: 'about:blank',
      browserContextId: contextId,
    }));
    const targets = await (
      await globalThis.fetch(new globalThis.URL('/json/list', endpoint))
    ).json();
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) throw new Error('Chrome did not expose the profiling tab');
    page = await connectCdp(target.webSocketDebuggerUrl, (event) => {
      if (event.method === 'Runtime.exceptionThrown')
        browserErrors.push(event.params.exceptionDetails);
      if (event.method === 'Network.loadingFailed' && !event.params.canceled)
        browserErrors.push(event.params);
    });
    const evaluate = async (expression) => {
      const result = await page.call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const until = async (expression, description, timeout = 30000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await pause(50);
      }
      throw new Error(`Timed out waiting for ${description}`);
    };
    await page.call('Network.enable');
    await page.call('Network.setCacheDisabled', { cacheDisabled: true });
    await page.call('Page.enable');
    await page.call('Runtime.enable');
    await page.call('Performance.enable');
    await page.call('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.call('Emulation.setCPUThrottlingRate', { rate: options.cpu });
    await page.call('Page.navigate', { url: options.url });
    await until(
      'document.readyState === "complete" && document.querySelector("#root")?.childElementCount > 0',
      'the application',
    );
    await evaluate(`(async () => {
      const { navStore } = await import('/src/store/navStore.ts');
      const { LocalGameClient } = await import('/src/services/LocalGameClient.ts');
      const client = new LocalGameClient({ seed: 42, debug: true, seats: [
        { kind: 'human', job: 'swordsman', name: 'A' },
        { kind: 'human', job: 'archer', name: 'B' },
        { kind: 'human', job: 'mage', name: 'C' },
        { kind: 'human', job: 'ninja', name: 'D' }
      ] });
      globalThis.__dragonRushProfile = { nav: navStore, client };
      navStore.getState().openGame(client);
    })()`);
    await until('document.querySelectorAll(".board-grid .tile").length === 24', 'the board');
    const visualReady = () =>
      evaluate(`(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => undefined)));
      return { fonts: document.fonts.status, images: document.images.length,
        decoded: [...document.images].filter(image => image.complete && image.naturalWidth > 0).length };
    })()`);
    const boardAssets = await visualReady();
    await pause(2500);
    await evaluate(
      'globalThis.__dragonRushProfile.nav.getState().route.session.store.getState().snap()',
    );
    if (!options.keepHandoff) await evaluate('document.querySelector(".handoff button")?.click()');
    await pause(500);
    await evaluate(`(() => {
      const state = globalThis.__dragonRushProfile;
      state.rectReads = 0; state.frames = []; state.longTasks = []; state.lastFrame = null;
      state.originalRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (...args) {
        state.rectReads += 1;
        return state.originalRect.apply(this, args);
      };
      state.observer = new PerformanceObserver(list => state.longTasks.push(...list.getEntries().map(entry => ({ duration: entry.duration, startTime: entry.startTime }))));
      state.observer.observe({ type: 'longtask', buffered: false });
      const frame = now => {
        if (state.lastFrame !== null) state.frames.push(now - state.lastFrame);
        state.lastFrame = now;
        state.raf = requestAnimationFrame(frame);
      };
      state.raf = requestAnimationFrame(frame);
    })()`);
    const metrics = async () =>
      Object.fromEntries(
        (await page.call('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
      );
    const measure = async (name, assets) => {
      await evaluate(`(() => { const state = globalThis.__dragonRushProfile;
        state.rectReads = 0; state.frames = []; state.longTasks = []; state.lastFrame = null;
        state.observer.takeRecords(); state.startedAt = performance.now(); })()`);
      const start = await metrics();
      await pause(options.seconds * 1000);
      const end = await metrics();
      const samples = await evaluate(`(() => { const state = globalThis.__dragonRushProfile;
        const board = document.querySelector('.board-area'); const canvas = document.querySelector('.combat-canvas');
        return { rectReads: state.rectReads, frames: state.frames,
          elapsedMs: performance.now() - state.startedAt,
          longTasks: state.longTasks.filter(entry => entry.startTime >= state.startedAt),
          dom: document.querySelectorAll('*').length,
          handoffPresent: !!document.querySelector('.handoff'),
          boardCovered: document.querySelector('.game')?.dataset.boardCovered === 'true',
          boardVisibility: board ? getComputedStyle(board).visibility : null,
          boardSize: board ? [board.clientWidth, board.clientHeight] : null,
          canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: canvas.style.width, cssHeight: canvas.style.height } : null };
      })()`);
      const frames = samples.frames.filter((ms) => ms > 0).sort((a, b) => a - b);
      const { frames: _frames, ...observations } = samples;
      const result = {
        name,
        ms: options.seconds * 1000,
        ...observations,
        assets,
        frameCount: frames.length,
        fps: (frames.length * 1000) / samples.elapsedMs,
        p50: frames[Math.floor(frames.length * 0.5)] ?? null,
        p95: frames[Math.floor(frames.length * 0.95)] ?? null,
        max: frames.at(-1) ?? null,
        over50: frames.filter((ms) => ms > 50).length,
        metrics: Object.fromEntries(
          [
            'TaskDuration',
            'ScriptDuration',
            'LayoutDuration',
            'RecalcStyleDuration',
            'LayoutCount',
            'RecalcStyleCount',
          ].map((key) => [key, (end[key] ?? 0) - (start[key] ?? 0)]),
        ),
      };
      globalThis.console.log(JSON.stringify(result));
      return result;
    };
    const output = {
      label: options.label,
      recordedAt: new Date().toISOString(),
      chrome: version,
      gpu: system?.gpu ?? null,
      url: options.url,
      mode: 'vite-development',
      seed: 42,
      cpuThrottle: options.cpu,
      viewport: [1440, 900],
      deviceScaleFactor: 1,
      cacheDisabled: true,
      keepHandoff: options.keepHandoff,
      ownedBrowser: owned !== null,
      cpuProfile: options.profile,
      audio: await evaluate(
        "import('/src/services/audio.ts').then(module => module.getAudioSettings())",
      ),
      conditions:
        'Four human seats; fonts and DOM images decoded before each scene; live fight warmed past intro, ready, and go overlays. Timing is machine-specific.',
      scenarios: [],
    };
    output.scenarios.push(await measure('board-idle', boardAssets));
    await mkdir(options.out, { recursive: true });
    const boardScreenshot = await page.call('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(options.out, `${options.label}-board.png`),
      Buffer.from(boardScreenshot.data, 'base64'),
    );
    await evaluate(`(async () => {
      const state = globalThis.__dragonRushProfile;
      const store = state.nav.getState().route.session.store;
      store.getState().snap();
      const actor = store.getState().latest.pending.actor;
      state.client.debugPatchPlayer(actor, { hp: 300, maxHp: 300, def: 40, atk: 10 });
      const submitted = await state.client.submit({ type: 'CHALLENGE_DRAGON' }, store.getState().latest.version);
      if (!submitted.ok) throw new Error(JSON.stringify(submitted));
      store.getState().snap();
    })()`);
    await until(
      'document.querySelector(".combat-canvas")?.width > 0 && !document.querySelector(".fight-intro, .fight-ready, .fight-go")',
      'live combat',
    );
    const fightAssets = await visualReady();
    fightAssets.canvasImages = await evaluate(`(async () => {
      const art = await import('/src/combat/render/combatImages.ts');
      const paths = await import('/src/types/assetPaths.ts');
      const { resolveAsset } = await import('/src/services/assets.ts');
      const setup = globalThis.__dragonRushProfile.nav.getState().route.session.store.getState().latest.fight.setup;
      const resources = [
        { path: paths.combatJobImagePath(setup.a.job), read: () => art.combatJobImage(setup.a.job) },
        { path: paths.combatDragonImagePath, read: () => art.combatDragonImage() }
      ].filter(resource => resolveAsset(resource.path));
      await Promise.all(resources.map(async resource => {
        const deadline = performance.now() + 10000;
        let image = resource.read();
        while (!image && performance.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
          image = resource.read();
        }
        if (!image) throw new Error('Combat image did not finish: ' + resource.path);
        await image.decode();
      }));
      return resources.length;
    })()`);
    await pause(500);
    await mkdir(options.out, { recursive: true });
    if (options.profile) {
      await page.call('Profiler.enable');
      await page.call('Profiler.start');
    }
    output.scenarios.push(await measure('live-dragon', fightAssets));
    if (options.profile) {
      const { profile } = await page.call('Profiler.stop');
      await writeFile(join(options.out, `${options.label}.cpuprofile`), JSON.stringify(profile));
    }
    output.browserErrors = browserErrors;
    await writeFile(join(options.out, `${options.label}.json`), JSON.stringify(output, null, 2));
    const screenshot = await page.call('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(options.out, `${options.label}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
    if (options.fightBench) {
      output.fightPreparation = await evaluate(`(async () => {
        const state = globalThis.__dragonRushProfile;
        state.nav.getState().go('home');
        cancelAnimationFrame(state.raf); state.observer.disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
        document.getElementById('root').style.display = 'none';
        const simulation = await import('/src/services/fight/fightSimulation.ts');
        const jobs = Array.from({ length: 12 }, (_, i) => ({ seed: 42 + i, level: 'normal', setup: {
          kind: 'duel',
          a: { job: 'swordsman', hp: 90, maxHp: 90, atk: 9, def: 8, indomitableAvailable: true },
          b: { job: 'berserker', hp: 90, maxHp: 90, atk: 9, def: 8, indomitableAvailable: false }
        } }));
        const NativeWorker = globalThis.Worker;
        let workerMessages = 0;
        globalThis.Worker = class extends NativeWorker {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', () => workerMessages++);
          }
        };
        const replayDigest = replay => {
          let hash = 2166136261;
          for (const input of replay.inputs) hash = Math.imul(hash ^ input, 16777619);
          return { result: replay.result, ticks: replay.ticks, inputHash: hash >>> 0 };
        };
        const results = [];
        try {
          for (const worker of [false, true]) {
            const runner = worker ? simulation.createFightSimulationRunner()
              : { run: simulation.simulateBotFight, dispose() {} };
            const gaps = []; const tasks = []; let last = performance.now();
            const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => entry.duration)));
            observer.observe({ type: 'longtask' });
            const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; }, 5);
            try {
              await new Promise(resolve => setTimeout(resolve, 30));
              const started = performance.now(); const replays = []; let submitMax = 0;
              for (const job of jobs) {
                const before = performance.now();
                const pending = runner.run(job);
                submitMax = Math.max(submitMax, performance.now() - before);
                replays.push(replayDigest(await pending));
              }
              const elapsedMs = performance.now() - started;
              await new Promise(resolve => setTimeout(resolve, 40));
              results.push({ worker, elapsedMs, submitMax, maxHeartbeatGap: Math.max(...gaps),
                longTaskCount: tasks.length, maxLongTask: Math.max(0, ...tasks), replays });
            } finally { clearInterval(timer); observer.disconnect(); runner.dispose(); }
          }
        } finally { globalThis.Worker = NativeWorker; }
        return { jobs: jobs.length, workerMessages, rendering: 'hidden-root',
          sameReplays: JSON.stringify(results[0].replays) === JSON.stringify(results[1].replays), results };
      })()`);
      if (!output.fightPreparation.sameReplays || output.fightPreparation.workerMessages !== 12)
        throw new Error('Worker benchmark did not produce 12 matching Worker replays');
      globalThis.console.log(
        JSON.stringify({ name: 'fight-preparation', ...output.fightPreparation }),
      );
    }
    output.browserErrors = browserErrors;
    await writeFile(join(options.out, `${options.label}.json`), JSON.stringify(output, null, 2));
    if (browserErrors.length)
      throw new Error(`Browser reported ${browserErrors.length} errors; inspect the JSON artifact`);
    globalThis.console.log(`Saved artifacts to ${options.out}`);
  } finally {
    await page
      ?.call('Runtime.evaluate', {
        expression: `(() => {
      const state = globalThis.__dragonRushProfile;
      if (!state) return;
      cancelAnimationFrame(state.raf); state.observer?.disconnect();
      if (state.originalRect) Element.prototype.getBoundingClientRect = state.originalRect;
      state.client.dispose(); delete globalThis.__dragonRushProfile;
    })()`,
      })
      .catch(() => {});
    if (targetId) await browser?.call('Target.closeTarget', { targetId }).catch(() => {});
    if (contextId)
      await browser
        ?.call('Target.disposeBrowserContext', { browserContextId: contextId })
        .catch(() => {});
    page?.close();
    browser?.close();
    await owned?.close();
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

try {
  const options = optionsFrom(process.argv.slice(2));
  if (options) await run(options);
  else globalThis.console.log(HELP);
} catch (error) {
  globalThis.console.error(error.message);
  process.exitCode = error.name === 'AbortError' ? 130 : 1;
}
