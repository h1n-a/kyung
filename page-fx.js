/* 홈 밖의 화면(궁궐 소개, 영상, 음악, 갤러리)에 넣는 움직임
   1) 화면 맨 위 사진 띠와 음악 표지에 홈과 같은 입체 효과를 넣는다 (data-depth 가 붙은 곳).
   2) 내용이 화면에 들어올 때 아래에서 떠오르듯 차례로 나타난다.
   3) 갤러리 사진은 마우스를 올리면 그 방향으로 살짝 기울어진다.
   "동작 줄이기"가 켜져 있으면 아무것도 하지 않는다. */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var root = document.documentElement;
  root.classList.add("fx");

  /* ---------- 1) 입체 사진 ---------- */
  var engine = window.palace3d;
  var view = engine ? engine.makeView({ focus: 0.5, zoom: 1.1, strength: [0.07, 0.05] }) : null;
  var DUSK = [0.66, 0.71, 0.8];
  var PLAIN = [1, 1, 1];
  var cache = {};       // 사진 주소 → { photo, depth }
  var current = null;   // 지금 입체로 보여 주는 자리

  function fit() {
    if (!view || !current) return;
    view.layout(current.offsetWidth, current.offsetHeight, parseFloat(current.getAttribute("data-ratio")) || 1.339, parseFloat(current.getAttribute("data-pos")) || 0.5);
  }
  function attach(host) {
    if (!view) return;
    if (current && current !== host) current.classList.remove("has-3d");
    current = host;
    if (!host) { view.active = false; return; }
    var base = host.getAttribute("data-depth");
    var pair = cache[base];
    if (!pair) {
      pair = cache[base] = { photo: new Image(), depth: new Image(), loaded: 0 };
      var done = function () { if (++pair.loaded === 2 && current === host) attach(host); };
      pair.photo.onload = done;
      pair.depth.onload = done;
      pair.photo.src = base + ".jpg";
      pair.depth.src = base + "-depth.jpg";
    }
    if (pair.loaded < 2) { view.active = false; return; }
    if (view.key !== base || view.canvas.parentNode !== host) {
      if (!view.show(base, pair.photo, pair.depth, host)) { view.active = false; return; }
    }
    host.classList.add("has-3d");
    view.tint = host.hasAttribute("data-plain") ? PLAIN : DUSK;
    view.lookScale = 1;
    view.fx = null;
    fit();
    view.active = true;
    engine.wake();
  }
  function refresh() {
    var section = document.querySelector(".view-section.is-active");
    attach(section ? section.querySelector("[data-depth]") : null);
  }

  /* ---------- 2) 차례로 나타나기 ---------- */
  var REVEAL = [
    ".page-head", ".jump-list li", ".accordion-item", ".timeline li", ".building", ".manner-list li",
    ".media-block", ".music-cover", ".music-panel > *", ".gallery-card", ".pager",
    ".visit", ".home-intro", ".index-list li"
  ].join(", ");
  var watcher = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      watcher.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -6% 0px" }) : null;

  [].forEach.call(document.querySelectorAll(REVEAL), function (el) {
    // 같은 줄에 나란히 있는 것끼리는 조금씩 늦게 나타난다
    var order = 0, prev = el.previousElementSibling;
    while (prev && order < 5) { order++; prev = prev.previousElementSibling; }
    el.style.setProperty("--order", String(order));
    el.classList.add("reveal");
    if (watcher) watcher.observe(el); else el.classList.add("is-in");
  });

  /* ---------- 3) 갤러리 사진 기울이기 ---------- */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    [].forEach.call(document.querySelectorAll(".gallery-card"), function (card) {
      card.addEventListener("pointermove", function (event) {
        var box = card.getBoundingClientRect();
        var x = (event.clientX - box.left) / box.width - 0.5;
        var y = (event.clientY - box.top) / box.height - 0.5;
        card.style.setProperty("--tilt-x", (-y * 7).toFixed(2) + "deg");
        card.style.setProperty("--tilt-y", (x * 9).toFixed(2) + "deg");
        card.style.setProperty("--shift-x", (-x * 14).toFixed(1) + "px");
        card.style.setProperty("--shift-y", (-y * 10).toFixed(1) + "px");
      });
      card.addEventListener("pointerleave", function () {
        ["--tilt-x", "--tilt-y", "--shift-x", "--shift-y"].forEach(function (name) { card.style.removeProperty(name); });
      });
    });
  }

  // 화면이 바뀔 때마다 그 화면의 사진으로 입체 효과를 옮긴다
  var sections = document.querySelectorAll(".view-section");
  var observer = new MutationObserver(refresh);
  [].forEach.call(sections, function (section) { observer.observe(section, { attributes: true, attributeFilter: ["class"] }); });
  window.addEventListener("resize", fit);
  refresh();
})();
