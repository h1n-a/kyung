/* 홈: 스크롤로 경복궁 12곳을 걸어서 지나간다.
   광화문(야경) → 흥례문 → 영제교 → 근정전 → 수정전 → 경회루 → 교태전 → 자경전 → 궁궐 담장 → 향원정 → 건청궁 → 집옥재
   - 홈 화면을 길게 만들고, 장면은 그동안 화면에 붙여 둔다. 스크롤한 만큼 다음 장소로 넘어간다.
   - 넘어가는 방식은 세 가지: 문으로 들어가기(portal), 길 따라 걸어가기(walk), 물에 비친 모습에서 떠오르기(water).
   "동작 줄이기"가 켜져 있으면 아무것도 하지 않고 기존 홈 화면 그대로 둔다. */
(function () {
  "use strict";

  var track = document.getElementById("heroTrack");
  var scene0 = document.getElementById("heroScene");
  var doors = document.getElementById("gateDoors");
  var layerBox = document.getElementById("walkLayers");
  var caption = document.getElementById("walkCaption");
  if (!track || !scene0 || !doors || !layerBox || !caption) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var stage = track.querySelector(".hero");
  var leafL = doors.querySelector(".gate-leaf--left");
  var leafR = doors.querySelector(".gate-leaf--right");
  var capCount = caption.querySelector(".walk-count b");
  var capName = caption.querySelector("h2");
  var capDesc = caption.querySelector(".walk-desc");
  var capCredit = caption.querySelector(".walk-credit");
  var progressBar = document.getElementById("walkProgress");
  var hint = document.getElementById("scrollHint");
  var skip = document.getElementById("walkSkip");
  var heroText = [].slice.call(stage.querySelectorAll(".hero-copy, .hero-foot"));
  var couplets = [].slice.call(stage.querySelectorAll(".hero-couplet"));

  /* 장소 목록 (걷는 순서).
     next  : 다음 장소로 넘어가는 방식
     door  : portal 일 때 들어갈 문의 자리 [왼쪽, 위, 오른쪽, 아래] (사진 안 0~1 비율)
     point : walk / water 일 때 다가가는 지점 [x, y]
     pos   : 사진이 화면보다 길 때 세로로 어디를 보여 줄지 (object-position 의 y) */
  var PLACES = [
    { name: "광화문" },
    { name: "흥례문", src: "assets/web/walk-05.jpg", next: "portal", door: [0.45, 0.5, 0.565, 0.645] },
    { name: "영제교", src: "assets/web/walk-07.jpg", next: "walk", point: [0.4, 0.42] },
    { name: "근정전", src: "assets/web/inner-night-1920.jpg", ratio: 1.5, pos: 0.58, night: true, next: "portal", door: [0.472, 0.6, 0.512, 0.66],
      credit: "사진: Seunghyuk Choi, 위키미디어 공용 (CC BY-SA 4.0)" },
    { name: "수정전", src: "assets/web/walk-10.jpg", next: "walk", point: [0.5, 0.55] },
    { name: "경회루", src: "assets/web/walk-03.jpg", next: "water", point: [0.5, 0.75] },
    { name: "교태전", src: "assets/web/walk-09.jpg", next: "portal", door: [0.385, 0.545, 0.465, 0.65] },
    { name: "자경전", src: "assets/web/walk-08.jpg", next: "walk", point: [0.72, 0.55] },
    { name: "궁궐 담장", src: "assets/web/walk-06.jpg", next: "walk", point: [0.8, 0.55] },
    { name: "향원정", src: "assets/web/walk-04.jpg", next: "water", point: [0.5, 0.78] },
    { name: "건청궁", src: "assets/web/walk-11.jpg", next: "portal", door: [0.293, 0.81, 0.338, 0.9] },
    { name: "집옥재", src: "assets/web/walk-12.jpg" }
  ];
  var LAST = PLACES.length - 1;

  // 스크롤 길이 (1 = 화면 높이 한 번)
  var GATE_LEN = 2.2;                                   // 광화문 문이 열리고 지나가는 구간
  var HOLD = 0.55;                                      // 한 장소에 머무는 구간
  var MOVE = { portal: 1.25, walk: 0.9, water: 1.0 };   // 넘어가는 구간
  var END_HOLD = 1.0;

  var HERO_RATIO = 2400 / 1431;
  var GATE_DOOR = [0.4830, 0.7122, 0.5342, 0.8052];
  var CANVAS_ZOOM = 1.04;    // hero-3d.js 가 사진을 살짝 확대해서 그리는 양
  var END_SCALE = 1.08;      // 문을 다 지났을 때 다음 장면의 크기
  // 사진을 실제로 확대하는 한계. 이보다 크게 늘리면 브라우저가 그릴 수 있는 크기를 넘어 화면이 깨진다.
  // 이 배율에 이르기 전에 사진은 어둠 속으로 사라지고, 그 뒤로는 문 모양만 계속 커진다.
  var REAL_ZOOM = 9;

  // 설명 문구는 갤러리 카드에 적어 둔 것을 그대로 쓴다
  PLACES.forEach(function (place) {
    var card = document.querySelector('.gallery-card[data-name="' + place.name + '"]');
    place.desc = card ? card.getAttribute("data-desc") : "";
  });

  // 구간표: 장소 i 에 머무는 구간과 i → i+1 로 넘어가는 구간
  var cursor = GATE_LEN;
  for (var n = 1; n <= LAST; n++) {
    var item = PLACES[n];
    item.holdStart = cursor;
    cursor += (n === LAST) ? END_HOLD : HOLD;
    item.moveStart = cursor;
    if (n < LAST) cursor += MOVE[item.next];
    item.moveEnd = cursor;
  }
  var TOTAL = cursor;

  // 장면 층 만들기 (사진은 가까워질 때 불러온다)
  PLACES.forEach(function (place, i) {
    if (!i) return;
    var layer = document.createElement("div");
    layer.className = "walk-scene" + (place.night ? " is-night" : "");
    var pic = document.createElement("div");
    pic.className = "walk-pic";
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    pic.appendChild(img);
    layer.appendChild(pic);
    layerBox.appendChild(layer);
    place.layer = layer;
    place.pic = pic;
    place.img = img;
    place.depth = new Image();   // 깊이 지도 (입체 효과용)
    place.ratio = place.ratio || 1800 / 1344;
    place.pos = place.pos == null ? 0.5 : place.pos;
    img.style.objectPosition = "50% " + place.pos * 100 + "%";
  });
  function load(i) {
    var place = PLACES[i];
    if (!place || !place.img || place.img.getAttribute("src")) return;
    place.img.src = place.src;
    place.depth.src = place.src.replace(/\.jpg$/, "-depth.jpg");
  }

  // 입체 효과: 화면에 동시에 보이는 장소는 많아야 둘이라, 입체 화면 두 개를 번갈아 쓴다
  var engine = window.palace3d;
  var pool = [];
  if (engine) {
    for (var v = 0; v < 2; v++) {
      var made = engine.makeView({ focus: 0.5, zoom: 1.06, strength: [0.056, 0.036], alpha: true });
      if (made) pool.push(made);
    }
    if (pool.length < 2) pool = [];
  }
  var DUSK = [0.66, 0.71, 0.8];   // 낮 사진을 해 질 녘 빛으로 맞추는 색 보정
  var PLAIN = [1, 1, 1];
  function ready(image) { return image.complete && image.naturalWidth > 0; }
  // 장소 i 를 지금 그리고 있는 입체 화면 (없으면 null)
  function viewOf(i) {
    var view = pool.length ? pool[i % 2] : null;
    return view && view.key === i && view.active && !view.lost ? view : null;
  }
  // 장소 i 에 입체 화면을 붙인다. 돌려주는 값은 사진이 확대되어 그려지는 양 (입체 화면이 없으면 1)
  function give3d(i, lookScale) {
    if (!pool.length) return 1;
    var place = PLACES[i], view = pool[i % 2];
    if (view.key !== i) {
      if (!ready(place.img) || !ready(place.depth) || !view.show(i, place.img, place.depth, place.pic)) {
        if (view.key !== i) return 1;
      }
    }
    if (view.host !== place.pic) {
      if (view.host) view.host.classList.remove("has-3d");
      view.host = place.pic;
      place.pic.classList.add("has-3d");
    }
    view.layout(size.sw, size.sh, place.ratio, place.pos);
    view.lookScale = lookScale;
    view.tint = place.night ? PLAIN : DUSK;
    view.light = 1;
    view.fx = null;
    view.active = true;
    return view.zoom;
  }
  function rest3d(a, b) {
    pool.forEach(function (view) { if (view.key !== a && view.key !== b) view.active = false; });
    if (engine) engine.wake();
  }

  track.classList.add("is-journey");
  track.style.height = "calc(" + (TOTAL + 1) * 100 + "svh)";

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function span(v, from, to) { return clamp01((v - from) / (to - from)); }

  var size = null;      // 화면 크기와 광화문 문 위치
  var shown = 0;        // 화면에 반영한 위치 (스크롤 단위)
  var wanted = 0;
  var ticking = false;
  var captionFor = -1;

  // object-fit: cover 와 같은 계산으로, 사진 속 비율 좌표를 화면 px 로 바꾼다
  function cover(boxW, boxH, ratio, posY) {
    var dw, dh, ox, oy;
    if (boxW / boxH > ratio) { dw = boxW; dh = boxW / ratio; ox = 0; oy = -(dh - boxH) * posY; }
    else { dh = boxH; dw = boxH * ratio; ox = -(dw - boxW) * 0.5; oy = 0; }
    return { x: function (f) { return ox + f * dw; }, y: function (f) { return oy + f * dh; }, w: dw, h: dh };
  }
  function rectOf(map, door) {
    var left = map.x(door[0]), top = map.y(door[1]), right = map.x(door[2]), bottom = map.y(door[3]);
    return { left: left, top: top, w: right - left, h: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  function measure() {
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var bw = scene0.offsetWidth, bh = scene0.offsetHeight;
    if (!sw || !bw || !bh) return false;
    var map = cover(bw, bh, HERO_RATIO, 0.62);
    var z = scene0.querySelector(".hero-canvas") ? CANVAS_ZOOM : 1;
    var zx = function (f) { return (map.x(f) - bw / 2) * z + bw / 2; };
    var zy = function (f) { return (map.y(f) - bh / 2) * z + bh / 2; };
    var gate = rectOf({ x: zx, y: zy }, GATE_DOOR);
    size = { sw: sw, sh: sh, gate: gate };

    scene0.style.transformOrigin = gate.cx + "px " + gate.cy + "px";
    doors.style.left = gate.left + "px";
    doors.style.top = gate.top + "px";
    doors.style.width = gate.w + "px";
    doors.style.height = gate.h + "px";
    doors.style.clipPath = "inset(0 round " + gate.w / 2 + "px " + gate.w / 2 + "px 0 0)";
    // 문짝은 같은 사진에서 문 부분만 잘라 보여 준다
    [leafL, leafR].forEach(function (leaf, i) {
      leaf.style.backgroundSize = map.w * z + "px " + map.h * z + "px";
      leaf.style.backgroundPosition = (zx(0) - gate.left - (i ? gate.w / 2 : 0)) + "px " + (zy(0) - gate.top) + "px";
    });
    return true;
  }

  function resetLayer(place) {
    place.layer.style.cssText = "";
    place.pic.style.cssText = "";
  }
  function showOnly(a, b) {
    for (var i = 1; i <= LAST; i++) {
      if (i === a || i === b) continue;
      if (PLACES[i].layer.style.visibility) resetLayer(PLACES[i]);
    }
    [a, b, Math.max(a, b) + 1, Math.max(a, b) + 2].forEach(load);
    rest3d(a, b);
  }

  /* 문으로 들어가기: 문 자리(rect)가 화면을 덮을 때까지 커지고, 그 문 모양 안으로 다음 장면이 보인다.
     다음 장면은 멀리 있는 것이라 문보다 천천히 커지다가 마지막에 화면을 채운다. */
  function throughDoor(next, rect, zoom, e, u, arch, bare) {
    var hw = (rect.w / 2) * zoom, hh = (rect.h / 2) * zoom;
    var top = rect.cy - hh, left = rect.cx - hw, right = size.sw - (rect.cx + hw), bottom = size.sh - (rect.cy + hh);
    var radius = arch ? hw + "px " + hw + "px 0 0" : hw * 0.06 + "px";
    next.layer.style.visibility = "visible";
    next.layer.style.zIndex = bare ? "1" : "2";
    next.layer.style.clipPath = bare ? "" : "inset(" + top + "px " + right + "px " + bottom + "px " + left + "px round " + radius + ")";
    next.layer.style.opacity = String(ease(span(u, 0.02, 0.14)));
    var t0 = Math.max(0.14, (rect.w * 1.5) / size.sw, (rect.h * 1.5) / size.sh);
    var t = Math.min(END_SCALE, Math.max(t0 * Math.pow(END_SCALE / t0, e), (hw * 2.6) / size.sw, (hh * 2.6) / size.sh));
    // 문 모양을 뚫어 보여 주는 방식에서는, 위 사진이 걷히기 시작하기 전에 다음 장면이 화면을 다 채우고 있어야 한다
    if (bare) t = Math.max(t, END_SCALE * ease(span(zoom, 1.6, 4.5)));
    var drift = 1 - ease(span(t, t0 * 1.5, END_SCALE));
    var fx = size.sw / 2, fy = size.sh * 0.56;
    next.pic.style.transformOrigin = fx + "px " + fy + "px";
    next.pic.style.transform = "translate(" + (rect.cx - fx) * drift + "px, " + (rect.cy - fy) * drift + "px) scale(" + t + ")";
    next.pic.style.setProperty("--light", String(0.5 + 0.5 * ease(span(e, 0.1, 0.9))));
  }

  function setCaption(i, opacity) {
    if (i !== captionFor && opacity > 0 && i > 0) {
      captionFor = i;
      var place = PLACES[i];
      capCount.textContent = (i < 9 ? "0" : "") + (i + 1);
      capName.textContent = place.name;
      capDesc.textContent = place.desc || "";
      capCredit.textContent = place.credit || "";
      capCredit.hidden = !place.credit;
    }
    caption.style.opacity = String(opacity);
    caption.style.transform = "translateY(" + (1 - opacity) * 18 + "px)";
  }

  // 구간 0: 광화문 문이 열리고 그 안으로 들어가 흥례문이 나온다
  function renderGate(p) {
    var gate = size.gate;
    var textOut = ease(span(p, 0, 0.1));
    heroText.forEach(function (el, i) {
      el.style.opacity = String(1 - textOut);
      el.style.transform = "translateY(" + (i === 0 ? -1 : 1) * textOut * 40 + "px)";
      el.style.pointerEvents = textOut > 0.5 ? "none" : "";
    });
    couplets.forEach(function (el, i) {
      el.style.opacity = String(1 - textOut);
      el.style.transform = "translateX(" + (i === 0 ? 1 : -1) * textOut * 60 + "px)";
    });

    var open = ease(span(p, 0.03, 0.3));
    leafL.style.transform = "rotateY(" + (-104 * open) + "deg)";
    leafR.style.transform = "rotateY(" + (104 * open) + "deg)";
    leafL.style.filter = leafR.style.filter = "brightness(" + (1 - open * 0.55) + ")";

    var e = ease(span(p, 0.05, 0.82));
    var zoom = Math.pow(30, e);
    var wall = 1 - ease(span(zoom, 4, REAL_ZOOM));
    scene0.style.visibility = wall > 0 ? "" : "hidden";
    scene0.style.transform = "scale(" + Math.min(zoom, REAL_ZOOM) + ")";
    scene0.style.opacity = String(wall);
    doors.style.transform = "scale(" + Math.min(zoom, REAL_ZOOM) + ")";
    doors.style.opacity = String(1 - ease(span(zoom, 3.5, REAL_ZOOM - 1)));

    showOnly(1, 1);
    give3d(1, ease(span(p, 0.8, 1)));
    var rect = { cx: scene0.offsetLeft + gate.cx, cy: scene0.offsetTop + gate.cy, w: gate.w, h: gate.h };
    throughDoor(PLACES[1], rect, zoom, e, p, true);
    setCaption(1, ease(span(p, 0.84, 0.97)));
  }

  // 장소 i 에서 i+1 로 넘어가는 구간 (u: 0~1)
  function renderMove(i, u) {
    var from = PLACES[i], to = PLACES[i + 1];
    showOnly(i, i + 1);
    // 넘어가는 동안에는 마우스 입체 움직임을 잠시 줄여서 문 위치가 어긋나지 않게 한다
    var z = give3d(i, 1 - ease(span(u, 0, 0.2)));
    give3d(i + 1, ease(span(u, 0.75, 1)));
    var flat = cover(size.sw, size.sh, from.ratio, from.pos);
    var map = {   // 입체 화면은 사진을 조금 확대해 그리므로 좌표도 같이 맞춘다
      x: function (f) { return (flat.x(f) - size.sw / 2) * z + size.sw / 2; },
      y: function (f) { return (flat.y(f) - size.sh / 2) * z + size.sh / 2; }
    };
    from.layer.style.visibility = "visible";
    from.layer.style.zIndex = "1";
    to.layer.style.visibility = "visible";
    to.layer.style.zIndex = "2";

    var fxView = viewOf(i);
    if (fxView) {
      // 입체 화면이 있으면 넘어가는 효과를 그 안에서 그린다.
      // 지금 장소가 위에서 걷히고(문이 뚫리거나, 가까운 것부터 스쳐 지나가거나, 물결로 번지며), 다음 장소는 그 아래에서 다가온다.
      from.layer.style.zIndex = "2";
      to.layer.style.zIndex = "1";
      var nextView = viewOf(i + 1);
      if (from.next === "portal") {
        var door = rectOf(map, from.door);
        var go = ease(span(u, 0, 0.94));
        var push = Math.pow(REAL_ZOOM, go);
        fxView.fx = {
          mode: 1, t: go, push: push,
          center: [door.cx / size.sw, door.cy / size.sh],
          door: [door.left / size.sw, door.top / size.sh, (door.left + door.w) / size.sw, (door.top + door.h) / size.sh]
        };
        throughDoor(to, door, push, go, u, false, true);
        if (nextView) nextView.light = 0.5 + 0.5 * ease(span(go, 0.1, 0.9));
      } else {
        var m = ease(u);
        var water = from.next === "water";
        fxView.fx = {
          mode: water ? 3 : 2, t: m, push: 1 + (water ? 0.12 : 0.3) * m,
          center: [map.x(from.point[0]) / size.sw, map.y(from.point[1]) / size.sh]
        };
        to.pic.style.transformOrigin = "50% 55%";
        to.pic.style.transform = "scale(" + (1.1 - 0.1 * m) + ")";
        var glow = 0.55 + 0.45 * ease(span(u, 0.15, 0.9));
        to.pic.style.setProperty("--light", String(glow));
        if (nextView) nextView.light = glow;
      }
      engine.wake();
    } else if (from.next === "portal") {
      var rect = rectOf(map, from.door);
      var maxZoom = Math.min(70, Math.max(size.sw / rect.w, size.sh / rect.h) * 1.3);
      var e = ease(span(u, 0, 0.92));
      var zoom = Math.pow(maxZoom, e);
      from.pic.style.transformOrigin = rect.cx + "px " + rect.cy + "px";
      var seen = 1 - ease(span(zoom, 3.5, REAL_ZOOM));
      from.pic.style.transform = "scale(" + Math.min(zoom, REAL_ZOOM) + ")";
      from.pic.style.opacity = String(seen);
      from.pic.style.visibility = seen > 0 ? "" : "hidden";
      throughDoor(to, rect, zoom, e, u, false);
    } else if (from.next === "water") {
      // 물에 비친 모습 쪽으로 시선을 내리면, 물결 너머로 다음 장소가 떠오른다
      var w = ease(u);
      from.pic.style.transformOrigin = map.x(from.point[0]) + "px " + map.y(from.point[1]) + "px";
      from.pic.style.transform = "translateY(" + (-16 * w) + "%) scale(" + (1 + 0.32 * w) + ")";
      var edge = w * 135;
      var wipe = "linear-gradient(to top, #000 " + (edge - 26) + "%, transparent " + edge + "%)";
      to.layer.style.webkitMaskImage = wipe;
      to.layer.style.maskImage = wipe;
      to.pic.style.transformOrigin = "50% 50%";
      to.pic.style.transform = "translateY(" + (1 - w) * 7 + "%) scale(" + (1.1 - 0.1 * w) + ")";
    } else {
      // 길을 따라 걸어 들어가면 다음 장소가 앞에서 다가온다
      var k = ease(u);
      from.pic.style.transformOrigin = map.x(from.point[0]) + "px " + map.y(from.point[1]) + "px";
      from.pic.style.transform = "scale(" + (1 + 0.7 * k) + ")";
      to.layer.style.opacity = String(ease(span(u, 0.22, 0.85)));
      to.pic.style.transformOrigin = "50% 55%";
      to.pic.style.transform = "scale(" + (1.22 - 0.22 * k) + ")";
    }

    if (u < 0.5) setCaption(i, 1 - ease(span(u, 0, 0.22)));
    else setCaption(i + 1, ease(span(u, 0.78, 1)));
  }

  function render(pos) {
    if (!size && !measure()) return;
    var walking = pos > 0.002;
    stage.classList.toggle("is-walking", walking);
    if (progressBar) progressBar.style.transform = "scaleX(" + clamp01(pos / TOTAL) + ")";
    if (hint) hint.classList.toggle("is-gone", pos > 0.04);

    if (!walking) {
      scene0.style.transform = scene0.style.opacity = scene0.style.visibility = "";
      heroText.concat(couplets).forEach(function (el) { el.style.opacity = el.style.transform = el.style.pointerEvents = ""; });
      showOnly(0, 0);
      setCaption(captionFor, 0);
      if (engine && engine.hero) { engine.hero.active = engine.hero.key !== null; engine.wake(); }
      return;
    }
    scene0.classList.add("is-lit");   // 점등 애니메이션이 덜 끝났어도 걷기 시작하면 다 켠다

    if (engine && engine.hero) { engine.hero.active = pos < GATE_LEN && engine.hero.key !== null; engine.wake(); }
    if (pos < GATE_LEN) { renderGate(pos / GATE_LEN); return; }

    // 광화문을 지난 뒤에는 첫 장면을 치워 둔다
    scene0.style.visibility = "hidden";
    doors.style.opacity = "0";
    heroText.concat(couplets).forEach(function (el) { el.style.opacity = "0"; el.style.pointerEvents = "none"; });

    var i = 1;
    while (i < LAST && pos >= PLACES[i].moveEnd) i++;
    var place = PLACES[i];
    if (i === LAST || pos < place.moveStart) {
      showOnly(i, i);
      resetLayer(place);
      place.layer.style.visibility = "visible";
      give3d(i, 1);
      setCaption(i, 1);
    } else {
      resetLayer(place);
      resetLayer(PLACES[i + 1]);
      renderMove(i, (pos - place.moveStart) / (place.moveEnd - place.moveStart));
    }
  }

  function readScroll() {
    var rect = track.getBoundingClientRect();
    var distance = rect.height - stage.offsetHeight;
    wanted = distance > 0 ? clamp01(-rect.top / distance) * TOTAL : 0;
    document.documentElement.classList.toggle("in-journey", rect.bottom > stage.offsetHeight * 0.6);
  }
  function frame() {
    // 스크롤을 바로 따라가지 않고 조금 늦게 따라가서 움직임이 매끄럽다
    shown += (wanted - shown) * 0.14;
    if (Math.abs(wanted - shown) < 0.0006) shown = wanted;
    render(shown);
    if (shown !== wanted) requestAnimationFrame(frame);
    else ticking = false;
  }
  function onScroll() {
    if (!stage.offsetParent) { document.documentElement.classList.remove("in-journey"); return; }   // 홈이 아닌 화면에서는 쉰다
    readScroll();
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    size = null;
    if (stage.offsetParent && measure()) { readScroll(); shown = wanted; render(shown); }
  });
  // 입체 효과 캔버스가 나중에 붙으면 문 위치가 조금 달라지므로 다시 잰다
  new MutationObserver(function () { size = null; if (stage.offsetParent) { measure(); render(shown); } })
    .observe(scene0, { childList: true });

  // 다른 화면에 다녀오면 스크롤 위치가 바뀌어 있으므로, 홈이 다시 보일 때 처음 상태부터 맞춘다
  var view = stage.closest(".view-section");
  if (view) {
    new MutationObserver(function () {
      if (!stage.offsetParent) { document.documentElement.classList.remove("in-journey"); return; }
      size = null;
      readScroll();
      shown = wanted;
      render(shown);
    }).observe(view, { attributes: true, attributeFilter: ["class"] });
  }

  // 건너뛰기: 둘러보기 구간 바로 아래로 내려간다
  if (skip) {
    skip.addEventListener("click", function (event) {
      event.preventDefault();
      var top = track.getBoundingClientRect().bottom + window.scrollY - (document.getElementById("siteHeader").offsetHeight + 8);
      window.scrollTo({ top: top, behavior: "smooth" });
    });
  }

  load(1);
  onScroll();
})();
