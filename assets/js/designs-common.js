/* ============================================================================
 * 四套设计共用的行为层（designs-common.js）
 *
 * 为什么要有这一份：三套新设计（材料手册 / 分屏沉浸 / 产品册）的**版式完全不同**，
 * 但有几件事是一样的 —— 滚动入场、图片放大、导航高亮、年份填充。
 * 若每套各写一遍，就会有三份实现、三份 bug。
 *
 * 边界：这里只放**与版式无关**的行为。凡是"长什么样、怎么排"的，都在各设计的
 * 自己的 CSS 里。共用的做法是**约定 data-* 钩子**，而不是约定 class 名 ——
 * 版式可以随便不同，只要挂上钩子即可：
 *   [data-reveal]        滚动入场（加 data-revealed="1" 后由 CSS 决定怎么显示）
 *   [data-zoom]          点击放大（值为图片 src）
 *   [data-nav-toggle]    移动端菜单开关（配合 [data-nav] 容器）
 *   [data-year]          填当前年份
 *
 * 术语/锚点 id 由《四套设计接口约定.md》统一，四套一致。
 * ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  // 标记 JS 就绪：CSS 里"入场初始隐藏"挂在 .js-ready 下，
  // 这样 JS 没跑时内容照样可见（不会白屏）。
  root.classList.add('js-ready');

  function ready(fn) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function reduced() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------------------------------------------------------- 滚动入场 */
  function initReveal() {
    var items = Array.prototype.slice.call(doc.querySelectorAll('[data-reveal]'));
    if (!items.length) return;

    if (reduced() || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.setAttribute('data-revealed', '1'); });
      return;
    }

    function reveal(el) {
      el.setAttribute('data-revealed', '1');
      io.unobserve(el);
    }

    /* 判定"该入场了"：顶边已越过视口底部。
       用顶边（不是底边）是实测结论：手机上卡片很高、视口只有 844px，
       卡片部分可见时底边仍 > innerHeight，会一直不揭示（曾导致 35/56
       元素停在 opacity:0）。顶边判据同时覆盖"部分可见/完全可见/已滚过头"。 */
    function entered(el) {
      var vh = window.innerHeight || doc.documentElement.clientHeight;
      return el.getBoundingClientRect().top < vh;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting || en.boundingClientRect.bottom < 0) reveal(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

    items.forEach(function (el) {
      io.observe(el);
    });

    /* 兜底扫描：懒加载图片就位后页面高度会变，或程序化快速滚动
       （点锚点、Ctrl+End）可能让 observer 来不及回调。 */
    var timer = null;
    function sweep() {
      items.forEach(function (el) {
        if (el.getAttribute('data-revealed') === '1') return;
        if (entered(el)) reveal(el);
      });
    }
    window.addEventListener('scroll', function () {
      if (timer) return;
      timer = window.setTimeout(function () { timer = null; sweep(); }, 120);
    }, { passive: true });
    window.addEventListener('load', sweep);
    sweep();
  }

  /* ---------------------------------------------------------- 图片放大 */
  function initLightbox() {
    var dlg = doc.getElementById('lightbox');
    if (!dlg || typeof dlg.showModal !== 'function') return;

    var img = dlg.querySelector('img');
    var cap = dlg.querySelector('[data-lightbox-cap]');

    doc.addEventListener('click', function (ev) {
      var trigger = ev.target.closest('[data-zoom]');
      if (!trigger) return;
      var src = trigger.getAttribute('data-zoom');
      if (!src) return;
      img.src = src;
      img.alt = trigger.getAttribute('data-zoom-alt') || '';
      if (cap) cap.textContent = trigger.getAttribute('data-zoom-cap') || '';
      dlg.showModal();
    });

    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) dlg.close();   // 点空白处关闭
    });
    var close = dlg.querySelector('[data-close]');
    if (close) close.addEventListener('click', function () { dlg.close(); });
  }

  /* ---------------------------------------------------------- 移动端菜单 */
  function initNav() {
    var toggle = doc.querySelector('[data-nav-toggle]');
    if (!toggle) return;
    var header = toggle.closest('header') || doc.body;

    toggle.addEventListener('click', function () {
      var open = header.getAttribute('data-nav') === 'open';
      header.setAttribute('data-nav', open ? 'closed' : 'open');
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    // 点菜单里的链接就收起，免得挡住刚跳过去的标题
    header.addEventListener('click', function (ev) {
      if (ev.target.closest('a[href^="#"]')) {
        header.setAttribute('data-nav', 'closed');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------------------------------------------------- 其他 */
  function initMisc() {
    // 年份是每年都会过期的东西，交给运行时填
    Array.prototype.forEach.call(doc.querySelectorAll('[data-year]'), function (el) {
      el.textContent = String(new Date().getFullYear());
    });

    // 头部滚动态（若该设计用了 data-scrolled 钩子）
    var header = doc.querySelector('header[data-scrolled]');
    if (!header) return;
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.setAttribute('data-scrolled', window.scrollY > 8 ? '1' : '0');
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  ready(function () {
    initReveal();
    initLightbox();
    initNav();
    initMisc();
  });
})();
