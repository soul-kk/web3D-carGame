/**
 * 输入管理：把键盘 / 触屏统一成 { throttle, brake, steer } 三个值。
 *
 * 游戏逻辑只读 input.read()，不关心玩家用的是键盘还是手指，
 * 这样以后要接手柄、方向盘也只用改这一个文件。
 */
export class Input {
  constructor({ touchControls = true } = {}) {
    /** 当前按下的按键集合，key 是 KeyboardEvent.code，例如 'KeyW'、'ArrowUp' */
    this.keys = Object.create(null);
    /** 触屏虚拟按键状态 */
    this.touch = { left: false, right: false, gas: false, brake: false };
    /** 动作键回调：'KeyM' → fn() */
    this.actions = new Map();

    this.#bindKeyboard();
    if (touchControls) this.#bindTouch();
    else if (!('ontouchstart' in window)) {
      document.getElementById('touch')?.classList.add('hidden');
    }
  }

  /**
   * 注册"一次按下触发一次"的动作键（开关音效、重置位置、开始比赛…）
   * @param {string} code KeyboardEvent.code
   * @param {() => void} handler
   */
  on(code, handler) {
    if (!this.actions.has(code)) this.actions.set(code, []);
    this.actions.get(code).push(handler);
  }

  /**
   * 读取这一帧的驾驶输入。
   * @returns {{throttle:number, brake:number, steer:number}} steer: 1=左 -1=右
   */
  read() {
    const k = this.keys;
    const t = this.touch;
    const gas = k.KeyW || k.ArrowUp || t.gas;
    const brake = k.KeyS || k.ArrowDown || t.brake;
    const left = k.KeyA || k.ArrowLeft || t.left;
    const right = k.KeyD || k.ArrowRight || t.right;

    return {
      throttle: gas ? 1 : 0,
      brake: brake ? 1 : 0,
      steer: (left ? 1 : 0) - (right ? 1 : 0),
    };
  }

  #bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      // 方向键 / 空格默认会滚动页面，挡掉
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      // 忽略长按产生的重复事件，保证动作键只触发一次
      const alreadyDown = this.keys[event.code];
      this.keys[event.code] = true;

      if (!alreadyDown) {
        for (const handler of this.actions.get(event.code) ?? []) handler(event);
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys[event.code] = false;
    });

    // 切到别的窗口时清空按键，避免"回来还在加速"
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
    });
  }

  #bindTouch() {
    if (!('ontouchstart' in window)) return;

    const root = document.getElementById('touch');
    if (!root) return;
    root.classList.remove('hidden');

    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const press = (event) => {
        event.preventDefault();
        this.touch[key] = true;
        // 移动端浏览器要求先有用户手势才能播放声音
        this.onFirstTouch?.();
      };
      const release = (event) => {
        event.preventDefault();
        this.touch[key] = false;
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };

    bind('touch-left', 'left');
    bind('touch-right', 'right');
    bind('touch-gas', 'gas');
    bind('touch-brake', 'brake');
  }
}
