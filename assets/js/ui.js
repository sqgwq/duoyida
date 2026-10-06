/* ============================================================================
 * 页面交互（ui.js）
 *
 * 内容全部在生成的 HTML 里（静态、可被搜索引擎读到、禁用 JS 也能看），
 * 本文件只负责「读得到但要动起来」的那几件事：
 *   · 头部滚动态与移动端菜单
 *   · 图库分组切换（数据来自页内 <script type="application/json">）
 *   · 图片放大查看
 *   · 滚动入场（只做一次，不重复触发）
 * ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  /* ---- 标记 JS 就绪。
     滚动入场的「初始隐藏」必须挂在这个前提下（见 styles.css 的 .js-ready），
     否则 JS 一旦没跑，整页内容会永远停在 opacity:0 上——那是最糟的失效方式。 */
  root.classList.add('js-ready');

  function ready(fn) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /* ---------------------------------------------------------- 读取页内数据 */
  function readJSON(id, fallback) {
    var el = doc.getElementById(id);
    if (!el) return fallback;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      // 坏数据不该让整页交互全挂：退回空集合，其余功能照常
      return fallback;
    }
  }

  /* ---------------------------------------------------------- 头部与菜单 */
  function initHeader() {
    var header = doc.querySelector('.site-header');
    if (!header) return;

    var toggle = header.querySelector('.nav-toggle');
    var nav = header.querySelector('.nav');

    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = header.getAttribute('data-nav') === 'open';
        header.setAttribute('data-nav', open ? 'closed' : 'open');
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (open) if (closeOnOutside) closeOnOutside();
        else {
          closeOnOutside = function () {
            doc.removeEventListener('click', onDocClick);
          };
        }
      });

      var onDocClick = function (ev) {
        if (!header.contains(ev.target)) {
          header.setAttribute('data-nav', 'closed');
          toggle.setAttribute('aria-expanded', 'false');
        }
      };
      var closeOnOutside = null;
      doc.addEventListener('click', onDocClick);

      // 点了菜单里的链接就收起，免得挡住刚跳过去的标题
      nav.addEventListener('click', function (ev) {
        if (ev.target.closest('a')) {
          header.setAttribute('data-nav', 'closed');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 滚动时给头部加阴影，让它与内容分层
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

  /* ---------------------------------------------------------- 当前区块高亮 */
  function initSpy() {
    var links = Array.prototype.slice.call(doc.querySelectorAll('.nav__link[href^="#"]'));
    if (!links.length) return;

    var map = {};
    var sections = [];
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = doc.getElementById(id);
      if (sec) {
        map[id] = a;
        sections.push(sec);
      }
    });

    if (!sections.length) return;

    function sync() {
      var y = window.scrollY + 120;
      var current = sections[0].id;
      sections.forEach(function (sec) {
        if (sec.offsetTop <= y) current = sec.id;
      });
      links.forEach(function (a) {
        a.setAttribute('aria-current', a === map[current] ? 'true' : 'false');
      });
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { sync(); ticking = false; });
    }, { passive: true });
    sync();
  }

  /* ---------------------------------------------------------- 滚动入场 */
  function initReveal() {
    var items = Array.prototype.slice.call(doc.querySelectorAll('[data-reveal]'));
    if (!items.length) return;

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 用户声明了减少动效，或环境不支持 IntersectionObserver：
    // 直接全部揭示，不摆「看不见的内容」这种坑
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.setAttribute('data-revealed', '1'); });
      return;
    }

    function reveal(el) {
      el.setAttribute('data-revealed', '1');
      io.unobserve(el);
    }

    /* 判定"该入场了"的统一谓词：元素**顶边**已越过视口底部。
       为什么用顶边而不是底边（这是一个实测踩出来的 bug）：
       先前写成 r.bottom < innerHeight，语义是"整个元素都在视口内"。
       手机上卡片很高、视口只有 844px，卡片**部分可见**时它的
       bottom 仍大于 innerHeight，于是被判为"还没到"而一直不揭示 ——
       实测滚完一遍仍有 35/56 个元素停在 opacity:0，整页看着像空的。
       顶边判据覆盖全部三种情况：部分可见、完全可见、已滚过头（top<0）。
       元素还在视口下方时 top >= innerHeight，正确地不揭示。 */
    function hasEntered(el) {
      var vh = window.innerHeight || doc.documentElement.clientHeight;
      return el.getBoundingClientRect().top < vh;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        // 进入视口，或已被一次滚过（错过了 isIntersecting）—— 都揭示
        if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
          reveal(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    items.forEach(function (el, i) {
      // 同组元素错开一点，避免整排同时弹出来显得生硬
      el.style.setProperty('--reveal-delay', (i % 6) * 45 + 'ms');
      io.observe(el);
    });

    /* 首屏标题的行级错峰不在此处理：标题动画在页面加载时就开始，
       而本脚本要 DOMContentLoaded 后才跑，用 JS 设行内延迟会来不及
       （实测各行都停在 0ms）。改由 CSS 的 nth-child 直接从
       --enter-stagger 令牌取（见 styles.css 的 .hero__title > span）。
       这样错峰随动效轴切换而变，切回 standard 时自动归零。 */

    /* 兜底扫描：懒加载图片就位后页面高度会变，有些元素可能因此"跳"过了
       视口而没被观察到；程序化快速滚动（如点锚点、Ctrl+End）也可能
       让 observer 来不及回调。滚动结束后做一次轻量复查，
       把已进入视口的元素补上。随机抽页看代码看不出这类时序问题，
       只有滚一遍再数 opacity 才会暴露。 */
    var sweepTimer = null;
    function sweep() {
      items.forEach(function (el) {
        if (el.getAttribute('data-revealed') === '1') return;
        if (hasEntered(el)) reveal(el);
      });
    }
    window.addEventListener('scroll', function () {
      if (sweepTimer) return;
      sweepTimer = window.setTimeout(function () {
        sweepTimer = null;
        sweep();
      }, 120);
    }, { passive: true });
    window.addEventListener('load', sweep);
    sweep();
  }

  /* ---------------------------------------------------------- 首屏滚动视差 */
  /* 只作用在主图上（.hero__media img），文字在 .hero__inner 里不动。
     视差是否生效由 --hero-parallax 令牌决定：默认 0（关，与改造前一致），
     开「动感」档后设为 1。用户声明减少动效时强制关闭。
     实现要点：移动量上限压得很小（视差感来自比例，不是大位移），
     且只在主图进入视口范围内时才更新，避免无谓的重排。 */
  function initParallax() {
    var heroImg = doc.querySelector('.hero__media img');
    var hero = doc.querySelector('.hero');
    if (!heroImg || !hero) return;

    var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function parallaxOn() {
      if (reduced) return false;
      return parseFloat(
        getComputedStyle(doc.documentElement).getPropertyValue('--hero-parallax')) === 1;
    }

    var ticking = false;
    function update() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        if (!parallaxOn()) {
          // 视差关掉时清空行内值，回到 transform:0（与改造前一致）
          heroImg.style.removeProperty('--hero-parallax-y');
          return;
        }
        var r = hero.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;   // 出视口不算
        // 按已滚过主图高度的比例给一个小位移；系数 0.18 保证幅度克制
        var ratio = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
        heroImg.style.setProperty('--hero-parallax-y',
          (ratio * r.height * 0.18).toFixed(1) + 'px');
      });
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------------------------------------------------------- 图库 */
  function initGallery() {
    var data = readJSON('gallery-data', null);
    if (!data || !data.groups) return;

    var tabsEl = doc.getElementById('gallery-tabs');
    var panelEl = doc.getElementById('gallery-panel');
    if (!tabsEl || !panelEl) return;

    var groups = data.groups;

    function renderPanel(key) {
      var g = groups[key];
      if (!g) return;
      var html = g.images.map(function (im) {
        var tall = im.tall ? ' shot--tall' : '';
        var cap = im.caption
          ? '<figcaption class="shot__cap">' + escapeHtml(im.caption) + '</figcaption>'
          : '';
        return '<figure class="shot' + tall + '">'
          + '<img src="' + escapeAttr(im.src) + '" alt="' + escapeAttr(im.alt) + '"'
          + ' loading="lazy" decoding="async" width="' + (im.w || 800) + '"'
          + ' height="' + (im.h || 600) + '">'
          + cap
          + '</figure>';
      }).join('');
      panelEl.innerHTML = '<div class="gallery">' + html + '</div>';
      // 计数元素是可选的：页面若没放它，不该让整条初始化链断掉
      if (count) count.textContent = g.images.length + ' 张';
    }

    var count = doc.getElementById('gallery-count');

    tabsEl.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.tab');
      if (!btn) return;
      var key = btn.getAttribute('data-group');
      Array.prototype.forEach.call(tabsEl.querySelectorAll('.tab'), function (t) {
        t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
      });
      renderPanel(key);
    });

    // 首屏只渲染选中的一组：94 张图一次性塞进 DOM 会让首屏变卡
    var first = tabsEl.querySelector('.tab[aria-selected="true"]') ||
      tabsEl.querySelector('.tab');
    if (first) {
      first.setAttribute('aria-selected', 'true');
      renderPanel(first.getAttribute('data-group'));
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------------------------------------------------------- 图片放大 */
  function initLightbox() {
    var dlg = doc.getElementById('lightbox');
    if (!dlg || typeof dlg.showModal !== 'function') return;   // 不支持 dialog 就退化为不放大

    var img = dlg.querySelector('img');
    var cap = dlg.querySelector('.lightbox__cap');

    doc.addEventListener('click', function (ev) {
      var trigger = ev.target.closest('[data-zoom]');
      if (!trigger) return;
      var src = trigger.getAttribute('data-zoom');
      if (!src) return;
      img.src = src;
      img.alt = trigger.getAttribute('data-zoom-alt') || '';
      cap.textContent = trigger.getAttribute('data-zoom-cap') || '';
      dlg.showModal();
    });

    // 点空白处关闭；点图本身不关
    dlg.addEventListener('click', function (ev) {
      if (ev.target === dlg) dlg.close();
    });

    var closeBtn = dlg.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { dlg.close(); });
  }

  /* ---------------------------------------------------------- 主题面板 */
  function initSettings() {
    if (!window.ThemeKit) return;
    var box = doc.getElementById('settings');
    var btn = doc.getElementById('settings-toggle');
    if (!box || !btn) return;

    var panel = box.querySelector('.settings__panel');

    btn.addEventListener('click', function () {
      var open = box.getAttribute('data-open') === '1';
      box.setAttribute('data-open', open ? '0' : '1');
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    // Esc 关闭
    doc.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && box.getAttribute('data-open') === '1') {
        box.setAttribute('data-open', '0');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });

    // 点面板外关闭
    doc.addEventListener('click', function (ev) {
      if (box.getAttribute('data-open') === '1' && !box.contains(ev.target)) {
        box.setAttribute('data-open', '0');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // 渲染三轴选项（选项来自 theme.js 的 AXES，不在此处另写一份）
    var axes = window.ThemeKit.axes;
    Object.keys(axes).forEach(function (name) {
      var host = panel.querySelector('[data-axis="' + name + '"]');
      if (!host) return;
      var legend = doc.createElement('div');
      legend.className = 'settings__legend';
      legend.textContent = axes[name].label;
      var opts = doc.createElement('div');
      opts.className = 'settings__opts';
      axes[name].options.forEach(function (o) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'opt';
        b.textContent = o.label;
        b.title = o.desc;
        b.setAttribute('data-axis-name', name);
        b.setAttribute('data-axis-value', o.value);
        b.addEventListener('click', function () {
          window.ThemeKit.set(name, o.value);
        });
        opts.appendChild(b);
      });
      host.appendChild(legend);
      host.appendChild(opts);
    });

    var resetBtn = panel.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () { window.ThemeKit.reset(); });

    // 状态变化 → 同步按钮选中态（三轴各自独立，互不影响）
    function sync() {
      Array.prototype.forEach.call(panel.querySelectorAll('.opt'), function (b) {
        var n = b.getAttribute('data-axis-name');
        var v = b.getAttribute('data-axis-value');
        b.setAttribute('aria-pressed', window.ThemeKit.get(n) === v ? 'true' : 'false');
      });
    }
    window.ThemeKit.subscribe(sync);
    sync();
  }

  /* ---------------------------------------------------------- 咨询表单 */
  /* 表单不接后端（静态站点）：把提交转成「拼好内容 + 打开本机邮件客户端」，
     并把结果如实告知用户。做成假成功提示是骗人。 */
  function initForm() {
    var form = doc.getElementById('inquiry');
    if (!form) return;
    var out = doc.getElementById('inquiry-result');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = (form.elements.name.value || '').trim();
      var phone = (form.elements.phone.value || '').trim();
      var need = (form.elements.need.value || '').trim();

      if (!name || !phone) {
        out.textContent = '请填写称呼与联系电话。';
        out.setAttribute('data-state', 'bad');
        return;
      }
      if (!/^[\d\s\-+()]{6,20}$/.test(phone)) {
        out.textContent = '联系电话格式看起来不对，请检查。';
        out.setAttribute('data-state', 'bad');
        return;
      }

      var to = form.getAttribute('data-mailto');
      var subject = '网站询价：' + name + (need ? '（' + need.slice(0, 18) + '）' : '');
      var body = '称呼：' + name + '\n电话：' + phone
        + (need ? '\n需求：' + need : '');
      var url = 'mailto:' + to + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(body);

      window.location.href = url;
      out.setAttribute('data-state', 'ok');
      out.textContent = '已打开你的邮件客户端，内容已填好；'
        + '若没有弹出，请直接致电或发邮件给我们（联系方式见下方）。';
    });
  }

  ready(function () {
    initHeader();
    initSpy();
    initReveal();
    initParallax();
    initGallery();
    initLightbox();
    initSettings();
    initForm();
    // 年份是每年都会过期的东西，交给运行时填
    var y = doc.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  });
})();
