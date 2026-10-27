(function () {
  'use strict';

  const CONFIG = Object.freeze({
    desktopParticles: 18000,
    mobileParticles: 7000,
    lowPowerParticles: 4500,
    minParticles: 2500,
    maxPixelRatio: 1.5,
    mobilePixelRatio: 1.25,
    flowSpeed: 0.055,
    pointerRadius: 0.38,
    pointerStrength: 0.14,
    swirlStrength: 0.12,
    spring: 38,
    damping: 11,
    energyDecay: 2.8,
    adaptationInterval: 1800,
    lowFps: 48,
    staticFps: 28
  });

  const vertexSource = `
    precision mediump float;
    attribute vec4 aSeed;
    uniform float uTime;
    uniform float uAspect;
    uniform float uPixelRatio;
    uniform float uScroll;
    uniform float uEnergy;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uSwirl;
    uniform vec2 uPointer;
    varying float vAlpha;
    varying float vTone;

    void main() {
      float theta = aSeed.x + uTime * (0.65 + aSeed.w * 0.35);
      float radius = aSeed.y;
      vec3 point = vec3(
        cos(theta) * (0.5 + radius * 0.82),
        sin(theta) * (0.14 + radius * 0.37),
        sin(theta * 2.0 + aSeed.w * 6.2831) * 0.42 + (aSeed.z - 0.5) * 0.38
      );
      point.x *= uAspect > 1.0 ? min(uAspect * 0.65, 1.18) : 1.16;
      point.y *= uAspect < 1.0 ? 1.7 : 1.0;
      point.y += sin(point.x * 2.4 + uTime * 0.45) * 0.035;
      point.z += uScroll * (aSeed.z - 0.35) * 1.8;
      vec2 projected = point.xy * 1.8 / (1.85 + point.z);
      projected *= 1.0 + uScroll * 0.32;
      projected.y -= uScroll * 0.12;

      vec2 delta = projected - uPointer;
      float distanceSquared = dot(delta, delta);
      float influence = exp(-distanceSquared / (uRadius * uRadius));
      vec2 direction = delta / max(length(delta), 0.001);
      projected += direction * influence * uEnergy * uStrength;
      projected += vec2(-direction.y, direction.x) * influence * uEnergy * uSwirl;

      gl_Position = vec4(projected, 0.0, 1.0);
      gl_PointSize = (1.0 + aSeed.w * 1.4) * uPixelRatio;
      float quietCenter = smoothstep(0.1, 0.75, length(projected * vec2(0.85, 1.2)));
      vAlpha = (0.08 + aSeed.w * 0.22) * (0.3 + quietCenter * 0.7) * (1.0 - uScroll * 0.55);
      vTone = aSeed.z;
    }
  `;

  const fragmentSource = `
    precision mediump float;
    varying float vAlpha;
    varying float vTone;
    void main() {
      float distanceToCenter = length(gl_PointCoord - 0.5);
      float alpha = (1.0 - smoothstep(0.12, 0.5, distanceToCenter)) * vAlpha;
      vec3 gray = vec3(0.40, 0.44, 0.52);
      vec3 blue = vec3(0.24, 0.39, 0.88);
      gl_FragColor = vec4(mix(gray, blue, smoothstep(0.7, 1.0, vTone) * 0.65), alpha);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createField(host) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 760px)');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false
    });
    if (!gl) return null;

    const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);

    const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
    const capacity = mobile.matches ? CONFIG.mobileParticles : lowPower ? CONFIG.lowPowerParticles : CONFIG.desktopParticles;
    const seeds = new Float32Array(capacity * 4);
    for (let index = 0; index < capacity; index += 1) {
      const offset = index * 4;
      const random = Math.abs((Math.sin(index * 127.1 + 311.7) * 43758.5453) % 1);
      seeds[offset] = (index / capacity) * Math.PI * 2 * 17 + random * 0.2;
      seeds[offset + 1] = Math.pow((index % 997) / 997, 0.72);
      seeds[offset + 2] = Math.abs((Math.sin(index * 78.233) * 43758.5453) % 1);
      seeds[offset + 3] = Math.abs((Math.sin(index * 12.9898) * 24634.6345) % 1);
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const seedLocation = gl.getAttribLocation(program, 'aSeed');
    gl.enableVertexAttribArray(seedLocation);
    gl.vertexAttribPointer(seedLocation, 4, gl.FLOAT, false, 0, 0);

    const uniforms = {};
    for (const name of ['Time', 'Aspect', 'PixelRatio', 'Scroll', 'Energy', 'Radius', 'Strength', 'Swirl', 'Pointer']) {
      uniforms[name] = gl.getUniformLocation(program, 'u' + name);
    }
    gl.uniform1f(uniforms.Radius, CONFIG.pointerRadius);
    gl.uniform1f(uniforms.Strength, CONFIG.pointerStrength);
    gl.uniform1f(uniforms.Swirl, CONFIG.swirlStrength);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    host.append(canvas);

    const pointer = { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, energy: 0, targetEnergy: 0 };
    const stats = { fps: 60, count: capacity, capacity, pixelRatio: 1, quality: 'high', webgl: true, static: reducedMotion.matches, paused: false, interaction: 0, scroll: 0 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let previousTime = performance.now();
    let sampleStart = previousTime;
    let sampleFrames = 0;
    let slowSamples = 0;
    let scroll = 0;
    let fieldVisible = true;

    function resize() {
      width = host.clientWidth;
      height = host.clientHeight;
      const cap = mobile.matches ? CONFIG.mobilePixelRatio : CONFIG.maxPixelRatio;
      stats.pixelRatio = Math.min(devicePixelRatio || 1, cap, stats.quality === 'reduced' ? 1 : cap);
      canvas.width = Math.round(width * stats.pixelRatio);
      canvas.height = Math.round(height * stats.pixelRatio);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniforms.Aspect, width / Math.max(height, 1));
      gl.uniform1f(uniforms.PixelRatio, stats.pixelRatio);
      if (stats.static) draw(performance.now(), 0);
    }

    function updateScroll() {
      scroll = Math.min(Math.max(window.scrollY / Math.max(innerHeight, 1), 0), 1);
      stats.scroll = scroll;
      if (stats.static || !frame) draw(performance.now(), 0);
    }

    function draw(now, delta) {
      if (!stats.static) {
        const step = Math.min(delta, 0.034);
        pointer.vx += (pointer.targetX - pointer.x) * CONFIG.spring * step;
        pointer.vy += (pointer.targetY - pointer.y) * CONFIG.spring * step;
        const damping = Math.exp(-CONFIG.damping * step);
        pointer.vx *= damping;
        pointer.vy *= damping;
        pointer.x += pointer.vx * step;
        pointer.y += pointer.vy * step;
        pointer.energy += (pointer.targetEnergy - pointer.energy) * (1 - Math.exp(-5 * step));
        pointer.targetEnergy *= Math.exp(-CONFIG.energyDecay * step);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.Time, stats.static ? 2 : now * 0.001 * CONFIG.flowSpeed);
      gl.uniform1f(uniforms.Scroll, scroll);
      gl.uniform1f(uniforms.Energy, pointer.energy);
      gl.uniform2f(uniforms.Pointer, pointer.x, pointer.y);
      stats.interaction = pointer.energy;
      stats.scroll = scroll;
      gl.drawArrays(gl.POINTS, 0, stats.count);
    }

    function adapt(now) {
      stats.fps = Math.round(sampleFrames * 1000 / Math.max(now - sampleStart, 1));
      sampleStart = now;
      sampleFrames = 0;
      if (stats.fps < CONFIG.lowFps) slowSamples += 1;
      else slowSamples = 0;
      if (slowSamples < 2 || stats.static) return;
      slowSamples = 0;
      if (stats.pixelRatio > 1) {
        stats.quality = 'reduced';
        resize();
      } else if (stats.count > CONFIG.minParticles) {
        stats.quality = 'reduced';
        stats.count = Math.max(CONFIG.minParticles, Math.floor(stats.count * 0.72));
      } else if (stats.fps < CONFIG.staticFps) {
        stats.quality = 'static';
        stats.static = true;
        cancelAnimationFrame(frame);
        frame = 0;
        draw(now, 0);
      }
    }

    function tick(now) {
      const delta = (now - previousTime) / 1000;
      previousTime = now;
      draw(now, delta);
      sampleFrames += 1;
      if (now - sampleStart >= CONFIG.adaptationInterval) adapt(now);
      if (!stats.static && !document.hidden && !$('landing').hidden && fieldVisible) frame = requestAnimationFrame(tick);
      else frame = 0;
    }

    function start() {
      if (!frame && !stats.static && !document.hidden && !$('landing').hidden && fieldVisible) {
        stats.paused = false;
        previousTime = performance.now();
        sampleStart = previousTime;
        sampleFrames = 0;
        frame = requestAnimationFrame(tick);
      }
    }

    function syncVisibility() {
      stats.paused = document.hidden || $('landing').hidden || !fieldVisible;
      if (stats.paused) { cancelAnimationFrame(frame); frame = 0; }
      else start();
    }

    function onPointerMove(event) {
      if (reducedMotion.matches || stats.static) return;
      pointer.targetX = event.clientX / Math.max(innerWidth, 1) * 2 - 1;
      pointer.targetY = 1 - event.clientY / Math.max(innerHeight, 1) * 2;
      pointer.targetEnergy = event.pointerType === 'touch' ? 0.65 : 1;
    }

    function onPointerEnd() { pointer.targetEnergy = 0; }
    function onMotionChange() {
      stats.static = reducedMotion.matches;
      stats.quality = stats.static ? 'reduced-motion' : 'high';
      if (stats.static) { cancelAnimationFrame(frame); frame = 0; draw(performance.now(), 0); }
      else start();
    }

    function $(id) { return document.getElementById(id); }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerEnd, { passive: true });
    window.addEventListener('pointercancel', onPointerEnd, { passive: true });
    document.addEventListener('pointerleave', onPointerEnd);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    document.addEventListener('visibilitychange', syncVisibility);
    new MutationObserver(syncVisibility).observe($('landing'), { attributes: true, attributeFilter: ['hidden'] });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        fieldVisible = entries[0].isIntersecting;
        syncVisibility();
      }).observe(host);
    }
    new MutationObserver(() => { resize(); updateScroll(); start(); }).observe($('app-shell'), { attributes: true, attributeFilter: ['hidden'] });
    reducedMotion.addEventListener('change', onMotionChange);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      frame = 0;
      stats.webgl = false;
      stats.static = true;
    });
    resize();
    updateScroll();
    start();
    return { canvas, stats, config: CONFIG };
  }

  const host = document.getElementById('ambient-field');
  globalThis.SuixinParticles = host ? createField(host) : null;
})();
