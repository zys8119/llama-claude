export function createShallowRefValue(this: shallowRef, value: any) {
  if (typeof value === "object") {
    return new Proxy(value, {
      get: (target, prop, receiver) => {
        return createShallowRefValue.call(
          this,
          Reflect.get(target, prop, receiver),
        );
      },
      set: (target, prop, value, receiver) => {
        this.distributeUpdates(value, true);
        return Reflect.set(target, prop, value, receiver);
      },
    });
  }
  return value;
}
export class shallowRef {
  _value: any;
  constructor(value) {
    this._value = createShallowRefValue.call(this, value);
  }
  subs = new Set();
  isRef = true;
  get value() {
    if (activeSub) {
      this.subs.add(activeSub);
    }
    return this._value;
  }
  // 派发更新
  distributeUpdates(newValue, isProxy = true) {
    if (!isProxy) {
      this._value = createShallowRefValue.call(this, newValue);
    }
    this.subs.forEach((sub: any) => {
      sub();
    });
  }
  set value(newValue) {
    this.distributeUpdates(newValue, false);
  }
}
export function ref(value?: any) {
  return new shallowRef(value);
}
let activeSub = null;
export function effect(fn) {
  activeSub = fn;
  fn();
  activeSub = null;
}
export function computed(fn): shallowRef {
  const value = ref(fn());
  effect(() => {
    value.value = fn();
  });
  return value;
}
