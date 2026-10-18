/**
 * WebGL2 post-processing.
 *
 * Two content layers (outgoing / incoming) are uploaded as textures and
 * combined in one fragment shader: transition + flash + bloom + scanlines +
 * grain + vignette + aberration + glitch + mosh + mosaic + zoom-blur.
 *
 * Every parameter is a pure function of song time, so the post stack is as
 * deterministic as the scenes underneath it.
 */

export interface PostOptions {
  transition?: 'cut' | 'fade' | 'pushLeft' | 'pushUp' | 'zoom' | 'scan' | 'whiteout';
  progress?: number;
  flash?: number;
  flashColor?: string;
  bloom?: number;
  bloomThreshold?: number;
  scan?: number;
  grain?: number;
  vignette?: number;
  aberration?: number;
  rgbSplit?: number;
  glitch?: number;
  mosh?: number;
  mosaic?: number;
  invert?: number;
  desat?: number;
  brightness?: number;
  zoomBlur?: number;
  zoom?: number;
  rot?: number;
  time?: number;
  seed?: number;
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uRes;
uniform int uTransition;
uniform float uProgress;

uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uBloom;
uniform float uBloomThreshold;
uniform float uScan;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
uniform float uRgbSplit;
uniform float uGlitch;
uniform float uMosh;
uniform float uMosaic;
uniform float uInvert;
uniform float uDesat;
uniform float uBrightness;
uniform float uZoomBlur;
uniform float uZoom;
uniform float uRot;
uniform float uTime;
uniform float uSeed;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 rot2(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c) * p;
}

vec2 mapUv(vec2 uv) {
  vec2 p = uv - 0.5;
  p = rot2(p, uRot);
  p /= max(0.0001, uZoom);
  return p + 0.5;
}

vec4 baseAt(vec2 uv) {
  vec2 p = mapUv(uv);
  float pr = clamp(uProgress, 0.0, 1.0);
  vec4 col = vec4(0.0);
  if (uTransition == 0) {
    col = texture(uA, p);
  } else if (uTransition == 1) {
    col = mix(texture(uA, p), texture(uB, p), pr);
  } else if (uTransition == 2) {
    vec2 a = p + vec2(pr, 0.0);
    vec2 b = p - vec2(1.0 - pr, 0.0);
    col = (a.x <= 1.0) ? texture(uA, a) : texture(uB, b);
  } else if (uTransition == 3) {
    vec2 a = p + vec2(0.0, -pr);
    vec2 b = p + vec2(0.0, 1.0 - pr);
    col = (a.y >= 0.0) ? texture(uA, a) : texture(uB, b);
  } else if (uTransition == 4) {
    vec2 pa = 0.5 + (p - 0.5) / (1.0 + 0.18 * pr);
    vec2 pb = 0.5 + (p - 0.5) / (0.82 + 0.18 * pr);
    vec4 a = texture(uA, pa);
    vec4 b = texture(uB, pb);
    col = mix(a, b, smoothstep(0.15, 0.85, pr));
  } else if (uTransition == 5) {
    float d = (p.x + p.y) * 0.5;
    float edge = smoothstep(0.0, 0.08, pr - d);
    col = mix(texture(uA, p), texture(uB, p), edge);
  } else if (uTransition == 6) {
    float white = smoothstep(0.0, 0.5, 1.0 - abs(pr - 0.5) * 2.0);
    col = mix(texture(uA, p), texture(uB, p), smoothstep(0.4, 0.6, pr));
    col = mix(col, vec4(1.0), white * 0.85);
  }
  return col;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);

  // horizontal glitch: rows shift independently
  if (uGlitch > 0.001) {
    float row = floor(uv.y * 28.0 + uTime * 7.0);
    float h = hash12(vec2(row, uSeed));
    if (h < uGlitch * 0.35) {
      uv.x += (hash12(vec2(row, uSeed + 3.0)) - 0.5) * 0.09 * uGlitch;
    }
  }
  // datamosh: macroblock displacement
  if (uMosh > 0.001) {
    vec2 blk = floor(uv * vec2(14.0, 9.0));
    float h = hash12(blk + uSeed);
    if (h < uMosh * 0.5) {
      uv += (vec2(hash12(blk + 1.0), hash12(blk + 2.0)) - 0.5) * 0.12 * uMosh;
    }
  }
  // mosaic
  if (uMosaic > 0.001) {
    vec2 cells = mix(vec2(220.0, 124.0), vec2(18.0, 10.0), uMosaic);
    uv = (floor(uv * cells) + 0.5) / cells;
  }

  vec3 col;
  if (uAberration > 0.001 || uRgbSplit > 0.001) {
    float d = (uAberration * 0.0035 + uRgbSplit * 0.02) * (1.0 + 0.4 * sin(uTime * 3.0));
    col.r = baseAt(uv + vec2(d, 0.0)).r;
    col.g = baseAt(uv).g;
    col.b = baseAt(uv - vec2(d, 0.0)).b;
  } else {
    col = baseAt(uv).rgb;
  }

  // zoom blur toward centre
  if (uZoomBlur > 0.001) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float k = float(i) / 6.0;
      vec2 p = mix(uv, vec2(0.5), k * 0.22 * uZoomBlur);
      acc += baseAt(p).rgb;
    }
    col = mix(col, acc / 7.0, clamp(uZoomBlur, 0.0, 1.0));
  }

  // bloom: bright-pass + cheap 8-tap blur
  if (uBloom > 0.001) {
    vec2 px = 1.0 / uRes;
    vec3 b = vec3(0.0);
    b += max(vec3(0.0), baseAt(uv + px * vec2( 3.0,  0.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2(-3.0,  0.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2( 0.0,  3.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2( 0.0, -3.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2( 6.0,  6.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2(-6.0,  6.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2( 6.0, -6.0)).rgb - uBloomThreshold);
    b += max(vec3(0.0), baseAt(uv + px * vec2(-6.0, -6.0)).rgb - uBloomThreshold);
    col += (b / 8.0) * uBloom;
  }

  // grade
  col *= uBrightness;
  if (uDesat > 0.001) {
    float l = luma(col);
    col = mix(col, vec3(l), clamp(uDesat, 0.0, 1.0));
  }
  if (uInvert > 0.001) {
    col = mix(col, 1.0 - col, clamp(uInvert, 0.0, 1.0));
  }
  if (uScan > 0.001) {
    float s = 0.5 + 0.5 * sin((vUv.y * uRes.y + uTime * 24.0) * 3.14159 * 0.5);
    col *= 1.0 - uScan * 0.35 * s;
  }
  if (uGrain > 0.001) {
    float n = hash12(gl_FragCoord.xy + vec2(uSeed * 37.0, uSeed * 91.0));
    col += (n - 0.5) * uGrain;
  }
  if (uVignette > 0.001) {
    vec2 q = vUv - 0.5;
    float v = smoothstep(0.28, 0.78, length(q) * 1.35);
    col *= 1.0 - v * uVignette;
  }
  if (uFlash > 0.001) {
    col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL: createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    throw new Error(`WebGL shader error: ${log}`);
  }
  return sh;
}

const TRANSITIONS: Record<string, number> = {
  cut: 0,
  fade: 1,
  pushLeft: 2,
  pushUp: 3,
  zoom: 4,
  scan: 5,
  whiteout: 6,
};

function hexVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class PostProcessor {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private width = 0;
  private height = 0;
  readonly ok: boolean;

  constructor(output: HTMLCanvasElement) {
    this.canvas = output;
    const gl = output.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) {
      this.gl = null as unknown as WebGL2RenderingContext;
      this.program = null as unknown as WebGLProgram;
      this.texA = null as unknown as WebGLTexture;
      this.texB = null as unknown as WebGLTexture;
      this.vao = null as unknown as WebGLVertexArrayObject;
      this.ok = false;
      return;
    }
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error('WebGL: createProgram failed');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`WebGL link error: ${gl.getProgramInfoLog(prog)}`);
    }
    this.program = prog;
    gl.useProgram(prog);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('WebGL: createVertexArray failed');
    this.vao = vao;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.texA = this.makeTexture();
    this.texB = this.makeTexture();
    gl.uniform1i(this.loc('uA'), 0);
    gl.uniform1i(this.loc('uB'), 1);
    this.ok = true;
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name) ?? null;
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('WebGL: createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return tex;
  }

  private upload(tex: WebGLTexture, unit: number, canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  render(a: HTMLCanvasElement, b: HTMLCanvasElement | null, o: PostOptions = {}): void {
    if (!this.ok) return;
    const gl = this.gl;
    if (this.width !== a.width || this.height !== a.height) {
      this.width = a.width;
      this.height = a.height;
      gl.viewport(0, 0, this.width, this.height);
    }
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    // uA is the outgoing (previous) shot, uB the incoming (current) shot, so
    // progress 0→1 always travels previous→current in every transition branch.
    this.upload(this.texA, 0, b === null ? a : b);
    this.upload(this.texB, 1, a);

    const set1 = (n: string, v: number) => gl.uniform1f(this.loc(n), v);
    const set2 = (n: string, x: number, y: number) => gl.uniform2f(this.loc(n), x, y);

    set2('uRes', this.width, this.height);
    gl.uniform1i(this.loc('uTransition'), TRANSITIONS[o.transition ?? 'cut'] ?? 0);
    set1('uProgress', o.progress ?? 0);
    set1('uFlash', o.flash ?? 0);
    const [fr, fg, fb] = hexVec3(o.flashColor ?? '#ffffff');
    gl.uniform3f(this.loc('uFlashColor'), fr, fg, fb);
    set1('uBloom', o.bloom ?? 0);
    set1('uBloomThreshold', o.bloomThreshold ?? 0.55);
    set1('uScan', o.scan ?? 0);
    set1('uGrain', o.grain ?? 0);
    set1('uVignette', o.vignette ?? 0);
    set1('uAberration', o.aberration ?? 0);
    set1('uRgbSplit', o.rgbSplit ?? 0);
    set1('uGlitch', o.glitch ?? 0);
    set1('uMosh', o.mosh ?? 0);
    set1('uMosaic', o.mosaic ?? 0);
    set1('uInvert', o.invert ?? 0);
    set1('uDesat', o.desat ?? 0);
    set1('uBrightness', o.brightness ?? 1);
    set1('uZoomBlur', o.zoomBlur ?? 0);
    set1('uZoom', o.zoom ?? 1);
    set1('uRot', o.rot ?? 0);
    set1('uTime', o.time ?? 0);
    set1('uSeed', o.seed ?? 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/** CPU fallback used when WebGL2 is unavailable (e.g. some headless setups). */
export class PostFallback {
  readonly ok = false;
  render(a: HTMLCanvasElement, b: HTMLCanvasElement | null, o: PostOptions = {}): void {
    const ctx = a.getContext('2d');
    if (!ctx) return;
    const p = Math.max(0, Math.min(1, o.progress ?? 0));
    if ((o.transition ?? 'cut') !== 'cut' && p > 0 && b && b !== a) {
      ctx.save();
      ctx.globalAlpha = p;
      ctx.drawImage(b, 0, 0);
      ctx.restore();
    }
    if (o.flash && o.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, o.flash);
      ctx.fillStyle = o.flashColor ?? '#ffffff';
      ctx.fillRect(0, 0, a.width, a.height);
      ctx.restore();
    }
  }
}
