/* 사진 입체 효과
   사진 한 장과 깊이 지도(밝을수록 가까움)를 WebGL로 겹쳐, 마우스를 움직이면
   가까운 곳과 먼 곳이 서로 다르게 밀리도록 한다.
   - 홈 첫 화면(광화문 야경)에 바로 적용한다.
   - hero-walk.js 와 page-fx.js 가 window.palace3d.makeView() 로 같은 효과를 다른 사진에도 쓴다.
   - 장소를 넘어갈 때의 효과(문으로 들어가기, 가까운 것부터 스쳐 지나가기, 물결로 번지기)도 여기서 그린다.
   WebGL을 쓸 수 없거나 "동작 줄이기"가 켜져 있으면 아무것도 하지 않고 원래 사진이 그대로 보인다. */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var VERT = "attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }";
  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform sampler2D uPhoto; uniform sampler2D uDepth;",
    "uniform vec2 uLook; uniform vec2 uScale; uniform vec2 uOffset; uniform vec2 uStrength;",
    "uniform float uFocus; uniform float uZoom; uniform float uAspect;",
    "uniform vec3 uTint;",        // 색 보정 (낮 사진을 해 질 녘 빛으로)
    "uniform float uMode;",       // 0 그대로, 1 문으로 들어가기, 2 가까운 것부터 스쳐 지나가기, 3 물결로 번지기
    "uniform float uT;",          // 넘어가는 정도 0~1
    "uniform vec2 uCenter;",      // 다가가는 지점 (화면 0~1, 왼쪽 위가 원점)
    "uniform float uPush;",       // 그 지점으로 다가간 배율 (1 이상)
    "uniform vec4 uDoor;",        // 문 자리 (다가가기 전 화면 좌표: 왼쪽, 위, 오른쪽, 아래)
    "varying vec2 v;",
    "vec2 toPhoto(vec2 s){ vec2 uv = (s - 0.5) / uZoom + 0.5; return uv * uScale + uOffset; }",
    "void main(){",
    "  vec2 s = vec2(v.x, 1.0 - v.y);",
    "  vec2 src = uCenter + (s - uCenter) / uPush;",          // 다가가기 전에 이 점이 있던 자리
    "  if (uMode > 1.5 && uMode < 2.5) {",                     // 가까운 것일수록 더 빨리 다가온다
    "    float near = texture2D(uDepth, toPhoto(src)).r;",
    "    src = uCenter + (s - uCenter) / (uPush * (1.0 + 0.22 * uT * near));",
    "  }",
    "  if (uMode > 2.5) {",                                    // 물결
    "    src.x += 0.014 * uT * sin(src.y * 46.0 + uT * 9.0);",
    "    src.y += 0.009 * uT * sin(src.x * 31.0 + uT * 7.0);",
    "  }",
    "  vec2 uv = toPhoto(src);",
    // uFocus 깊이를 기준으로 앞과 뒤가 반대로 밀린다.
    // 이 화면 점에 와야 할 사진 속 점을 몇 번 되짚어 찾아야 윤곽선이 휘지 않고 통째로 움직인다.
    "  vec2 q = uv; vec2 prev = uv;",
    "  for (int i = 0; i < 5; i++) {",
    "    prev = q;",
    "    q = uv + uLook * (texture2D(uDepth, q).r - uFocus) * uStrength;",
    "  }",
    "  q = mix(prev, q, 0.5);",
    "  vec3 color = texture2D(uPhoto, clamp(q, 0.002, 0.998)).rgb;",
    "  float depth = texture2D(uDepth, clamp(q, 0.002, 0.998)).r;",
    "  float alpha = 1.0;",
    "  if (uMode > 0.5 && uMode < 1.5) {",
    // 문으로 빨려 들어갈 때는 문 쪽으로 번지는 잔상을 더해 속도감을 준다
    "    float streak = min(0.1, 0.03 * log2(max(uPush, 1.0)));",
    "    vec3 sum = color;",
    "    for (int k = 1; k <= 7; k++) {",
    "      vec2 s2 = uCenter + (s - uCenter) * (1.0 - streak * float(k) / 7.0);",
    "      sum += texture2D(uPhoto, clamp(toPhoto(uCenter + (s2 - uCenter) / uPush), 0.002, 0.998)).rgb;",
    "    }",
    "    color = sum / 8.0;",
    // 문 자리는 뚫어서 그 너머 장면이 보이게 한다
    "    vec2 mid = (uDoor.xy + uDoor.zw) * 0.5;",
    "    vec2 half2 = (uDoor.zw - uDoor.xy) * 0.5;",
    "    vec2 p = (src - mid) * vec2(uAspect, 1.0);",
    "    vec2 h = half2 * vec2(uAspect, 1.0);",
    "    float r = min(h.x, h.y) * 0.1;",
    "    vec2 dq = abs(p) - h + r;",
    "    float dist = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - r;",
    "    float soft = 0.004 / uPush;",
    "    alpha = smoothstep(-soft, soft, dist);",
    "    alpha *= 1.0 - smoothstep(4.5, 8.8, uPush);",                // 문 가까이 가면 벽은 걷히고 다음 장소만 남는다
    "    color *= mix(1.0, 0.6, smoothstep(2.0, 8.0, uPush));",     // 문 가까이는 그늘
    "  } else if (uMode > 1.5 && uMode < 2.5) {",
    "    float edge = 1.3 - uT * 1.6;",                              // 가까운 것부터 지나쳐 사라진다
    "    alpha = 1.0 - smoothstep(edge - 0.16, edge, depth);",
    "  } else if (uMode > 2.5) {",
    "    float line = 1.18 - uT * 1.5;",                             // 아래(물)에서부터 번져 올라온다
    "    float wave = 0.028 * sin(s.x * 17.0 + uT * 8.0) + 0.013 * sin(s.x * 43.0 - uT * 5.0);",
    "    alpha = 1.0 - smoothstep(line - 0.12, line, s.y + wave);",
    "  }",
    "  color *= uTint;",
    "  gl_FragColor = vec4(color * alpha, alpha);",
    "}"
  ].join("\n");

  var look = { x: 0, y: 0 };      // 지금 보여 주는 시선 (-1 ~ 1)
  var target = { x: 0, y: 0 };    // 마우스가 가리키는 시선
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var views = [];
  var running = false;
  var keepAwake = 0;              // 넘어가는 효과가 도는 동안에는 계속 그린다

  /* 입체 화면 하나 만들기.
     focus    : 움직이지 않는 깊이 (0 = 가장 먼 곳, 1 = 가장 가까운 곳)
     zoom     : 가장자리를 숨기려고 확대하는 양
     strength : 좌우·상하로 밀리는 양 (화면 너비·높이에 대한 비율)
     alpha    : 넘어가는 효과로 일부를 투명하게 뚫을 화면이면 true */
  function makeView(options) {
    var canvas = document.createElement("canvas");
    canvas.className = options.className || "depth-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var gl = canvas.getContext("webgl", { alpha: !!options.alpha, antialias: false });
    if (!gl) return null;

    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uniform = {};
    ["uLook", "uScale", "uOffset", "uStrength", "uFocus", "uZoom", "uAspect", "uTint", "uMode", "uT", "uCenter", "uPush", "uDoor", "uPhoto", "uDepth"].forEach(function (name) {
      uniform[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform1i(uniform.uPhoto, 0);
    gl.uniform1i(uniform.uDepth, 1);
    gl.uniform1f(uniform.uFocus, options.focus);
    gl.uniform1f(uniform.uZoom, options.zoom);

    function upload(unit, image) {
      var texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      return texture;
    }

    var view = {
      canvas: canvas,
      zoom: options.zoom,
      key: null,            // 지금 어떤 사진을 올려 두었는지
      active: false,        // 그릴지 말지
      lookScale: 1,         // 1 이면 마우스를 그대로 따르고, 0 이면 가만히 있는다
      tint: [1, 1, 1],      // 색 보정
      light: 1,             // 밝기
      fx: null,             // 넘어가는 효과 { mode, t, center: [x, y], push, door: [l, t, r, b] }
      lost: false,
      textures: [],
      laid: ""
    };

    // 사진과 깊이 지도를 올리고 캔버스를 host 안에 넣는다. 실패하면 false (원래 사진이 그대로 보인다)
    view.show = function (key, photo, depth, host) {
      if (view.lost) return false;
      try {
        view.textures.forEach(function (texture) { gl.deleteTexture(texture); });
        view.textures = [upload(0, photo), upload(1, depth)];
      } catch (error) {
        return false;   // 파일을 직접 연 경우(file://)처럼 브라우저가 사진 읽기를 막을 때
      }
      view.key = key;
      view.laid = "";
      view.fx = null;
      if (canvas.parentNode !== host) host.appendChild(canvas);
      wake();
      return true;
    };

    // 화면 크기와 사진 비율에 맞춰 object-fit: cover; object-position: 50% posY 와 같은 잘림을 계산한다.
    // 크기는 확대(transform)와 상관없는 원래 배치 크기를 받아야 한다.
    view.layout = function (boxW, boxH, ratio, posY) {
      var stamp = boxW + "x" + boxH + "x" + ratio + "x" + posY;
      if (stamp === view.laid || !boxW || !boxH) return;
      view.laid = stamp;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(boxW * dpr);
      canvas.height = Math.round(boxH * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniform.uAspect, boxW / boxH);
      var boxRatio = boxW / boxH, keep;
      if (boxRatio > ratio) {
        keep = ratio / boxRatio;
        gl.uniform2f(uniform.uScale, 1, keep);
        gl.uniform2f(uniform.uOffset, 0, (1 - keep) * posY);
        gl.uniform2f(uniform.uStrength, options.strength[0], options.strength[1] * keep);
      } else {
        keep = boxRatio / ratio;
        gl.uniform2f(uniform.uScale, keep, 1);
        gl.uniform2f(uniform.uOffset, (1 - keep) * 0.5, 0);
        // 좁은 화면은 사진의 가운데만 보이므로 밀리는 양을 그만큼 줄인다
        gl.uniform2f(uniform.uStrength, options.strength[0] * keep, options.strength[1]);
      }
      wake();
    };

    view.draw = function () {
      if (!view.active || view.lost || view.key === null) return;
      var fx = view.fx;
      gl.uniform2f(uniform.uLook, look.x * view.lookScale, look.y * view.lookScale);
      gl.uniform3f(uniform.uTint, view.tint[0] * view.light, view.tint[1] * view.light, view.tint[2] * view.light);
      gl.uniform1f(uniform.uMode, fx ? fx.mode : 0);
      gl.uniform1f(uniform.uT, fx ? fx.t : 0);
      gl.uniform2f(uniform.uCenter, fx ? fx.center[0] : 0.5, fx ? fx.center[1] : 0.5);
      gl.uniform1f(uniform.uPush, fx ? fx.push : 1);
      if (fx && fx.door) gl.uniform4f(uniform.uDoor, fx.door[0], fx.door[1], fx.door[2], fx.door[3]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    canvas.addEventListener("webglcontextlost", function () {
      view.lost = true;
      view.active = false;
      canvas.remove();   // 원래 사진이 다시 보인다
    });

    views.push(view);
    return view;
  }

  function frame(time) {
    if (!canHover) {
      // 터치 기기에는 마우스가 없으므로 아주 느리게 좌우로 흔들린다
      target.x = Math.sin(time / 2600) * 0.6;
      target.y = Math.cos(time / 3400) * 0.35;
    }
    look.x += (target.x - look.x) * 0.07;
    look.y += (target.y - look.y) * 0.07;
    var anyActive = false;
    views.forEach(function (view) { if (view.active && !view.lost) { anyActive = true; view.draw(); } });
    // 제목과 세로 글귀는 사진보다 앞에 떠 있는 것처럼 조금 더 움직인다
    document.documentElement.style.setProperty("--look-x", look.x.toFixed(4));
    document.documentElement.style.setProperty("--look-y", look.y.toFixed(4));
    var settled = Math.abs(target.x - look.x) < 0.0008 && Math.abs(target.y - look.y) < 0.0008;
    if (keepAwake > 0) keepAwake--;
    if (!anyActive || (canHover && settled && keepAwake <= 0)) { running = false; return; }
    requestAnimationFrame(frame);
  }
  // 다음 몇 프레임을 다시 그리게 한다 (화면이 바뀌었을 때 부른다)
  function wake() {
    keepAwake = 3;
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  window.addEventListener("pointermove", function (event) {
    if (!canHover || event.pointerType === "touch") return;
    target.x = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
    target.y = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1));
    wake();
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", function () {
    target.x = 0; target.y = 0;
    wake();
  });

  var api = { makeView: makeView, wake: wake, hero: null };
  window.palace3d = api;

  /* 홈 첫 화면: 광화문 야경. 광화문 면(깊이 약 0.62)을 기준으로 하늘과 광장이 반대로 움직인다 */
  var scene = document.getElementById("heroScene");
  if (!scene) return;
  var photo = scene.querySelector("img");
  var hero = makeView({ className: "hero-canvas", focus: 0.62, zoom: 1.04, strength: [0.058, 0.036] });
  if (!hero) return;
  api.hero = hero;

  function layoutHero() {
    // 스크롤로 확대된 상태에서도 원래 배치 크기를 써야 캔버스가 터무니없이 커지지 않는다
    hero.layout(scene.offsetWidth, scene.offsetHeight, photo.naturalWidth / photo.naturalHeight, 0.62);
  }
  window.addEventListener("resize", function () { if (hero.key !== null) { layoutHero(); wake(); } });

  function start(depth) {
    if (!hero.show("hero", photo, depth, scene)) return;
    layoutHero();
    hero.active = true;
    wake();
  }
  var depth = new Image();
  depth.onload = function () {
    if (photo.complete && photo.naturalWidth) start(depth);
    else photo.addEventListener("load", function () { start(depth); }, { once: true });
  };
  depth.src = "assets/web/hero-depth.png";
})();
