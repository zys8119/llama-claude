export function createShallowRefValue(this: shallowRef, value: any) {
  if (typeof value === "object") {
    return new Proxy(value, {
      get(target, prop, receiver) {
        return createShallowRefValue.call(
          this,
          Reflect.get(target, prop, receiver),
        );
      },
      set: (target, prop, value, receiver) => {
        this.subs.forEach((sub: any) => {
          sub();
        });
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
  set value(newValue) {
    this._value = createShallowRefValue.call(this, newValue);
    console.log(activeSub, 344);
    this.subs.forEach((sub: any) => {
      sub();
    });
  }
}
export function ref(value) {
  return new shallowRef(value);
}
let activeSub = null;
export function effect(fn) {
  activeSub = fn;
  fn();
  activeSub = null;
}
