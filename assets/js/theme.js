/* ============================================================================
 * 主题控制器（theme.js）
 *
 * 职责：读/写三轴选择 → 落到 <html> 的 data-ui-* 属性 → 持久化到 localStorage。
 *
 * 四条必须守住的行为（规范第五节）：
 *   1. 三轴独立 —— 切一轴不动另两轴；
 *   2. 默认值**不写属性** —— 默认皮肤就是 tokens.css 的 :root，
 *      把 "steel" / "sharp" / "standard" 写进 DOM 反而多一层无意义的间接；
 *   3. 非法轴值**拒绝**，不改状态、不抛错；
 *   4. 坏存储**回默认** —— localStorage 用户能改、且跨版本存活，
 *      旧皮肤名失效后若直接用，页面会落入「没有任何令牌块生效」的状态而整页发白。
 * ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'duoyida.ui';

  /* 三轴的可选值与默认值。
     新增皮肤：只在这里加一项 + 在 themes.css 加对应令牌块，组件样式不动。 */
  var AXES = {
    base: {
      attr: 'data-ui-base',
      label: '配色',
      // 第一项即默认值（默认不写属性）
      options: [
        { value: 'steel', label: '钢蓝', desc: '取自宣传册品牌色' },
        { value: 'slate', label: '石板灰', desc: 'shadcn slate' },
        { value: 'stone', label: '暖石灰', desc: 'shadcn stone' },
        { value: 'navy', label: '深钢蓝', desc: '更深的品牌蓝' }
      ]
    },
    style: {
      attr: 'data-ui-style',
      label: '风格',
      options: [
        { value: 'sharp', label: '锐利', desc: '小圆角 · 紧凑' },
        { value: 'soft', label: '柔和', desc: '大圆角' },
        { value: 'airy', label: '宽松', desc: '大留白' }
      ]
    },
    motion: {
      attr: 'data-ui-motion',
      label: '动效',
      options: [
        { value: 'standard', label: '标准', desc: 'transitions.dev 原值' },
        { value: 'brisk', label: '轻快', desc: '更快 · 工具感' },
        { value: 'gentle', label: '舒缓', desc: '更慢 · 讲解感' },
        { value: 'kinetic', label: '动感', desc: '逐字入场 · 视差 · 大图推近' }
      ]
    }
  };

  var axisNames = Object.keys(AXES);

  /* 当前状态。初值即各轴默认值。 */
  var state = {};
  axisNames.forEach(function (name) {
    state[name] = AXES[name].options[0].value;
  });

  function isValid(name, value) {
    if (!Object.prototype.hasOwnProperty.call(AXES, name)) return false;
    return AXES[name].options.some(function (o) {
      return o.value === value;
    });
  }

  /* 读存储。任何异常（禁用 localStorage、JSON 坏掉、值非法）都回默认，
     绝不让页面因存储问题而落进「无令牌」状态。 */
  function readStore() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
    } catch (e) {
      return null;   // 隐私模式等：读不到就当没有
    }
    if (!raw) return null;
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return null;   // 坏 JSON：回默认
    }
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  }

  function writeStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* 存不进去不影响本次会话的显示，静默即可 —— 弹提示反而更烦人 */
    }
  }

  /* 把状态落到 DOM。默认值不写属性，并移除可能残留的属性。 */
  function apply() {
    var root = document.documentElement;
    axisNames.forEach(function (name) {
      var def = AXES[name].options[0].value;
      if (state[name] === def) {
        root.removeAttribute(AXES[name].attr);
      } else {
        root.setAttribute(AXES[name].attr, state[name]);
      }
    });
    // 供 CSS/断言判断「当前是否有非默认皮肤生效」
    root.setAttribute('data-ui-ready', '1');
  }

  function get(name) {
    return Object.prototype.hasOwnProperty.call(state, name) ? state[name] : null;
  }

  /* 设置单轴。非法值 → 拒绝并返回 false（不改动任何状态）。 */
  function set(name, value) {
    if (!isValid(name, value)) return false;
    state[name] = value;
    apply();
    writeStore();
    emit();
    return true;
  }

  function reset() {
    axisNames.forEach(function (name) {
      state[name] = AXES[name].options[0].value;
    });
    apply();
    writeStore();
    emit();
  }

  var listeners = [];
  function emit() {
    listeners.forEach(function (fn) {
      try { fn(getAll()); } catch (e) { /* 单个订阅者出错不影响其它订阅者 */ }
    });
  }

  function getAll() {
    var out = {};
    axisNames.forEach(function (n) { out[n] = state[n]; });
    return out;
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /* ---- 初始化 ---- */
  var stored = readStore();
  if (stored) {
    // 逐轴校验：坏值丢弃、保留好值 —— 而不是「一处坏就全丢」
    axisNames.forEach(function (name) {
      if (isValid(name, stored[name])) state[name] = stored[name];
    });
  }
  apply();

  // 设置面板可能在脚本之前就已解析（脚本放在 body 末尾，一般不会），
  // 因此暴露 restore，允许调用方在 DOM 就绪后再同步一次控件状态。
  window.ThemeKit = {
    axes: AXES,
    get: get,
    getAll: getAll,
    set: set,
    reset: reset,
    subscribe: subscribe,
    isValid: isValid,
    /* 供测试用：不经过校验直接写状态，用来验证 apply() 的行为。
       放在 __test 命名空间下，避免被业务代码误用。 */
    __test: {
      apply: apply,
      state: state,
      readStore: readStore,
      KEY: STORE_KEY
    }
  };
})();
