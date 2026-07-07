/**
 * Runtime polyfills for older mobile browsers (old Android WebView / Chrome < 85,
 * Samsung Internet < 14, iOS Safari < 13.4).
 *
 * Vite's build `target: es2017` only down-levels modern *syntax* — it does NOT
 * add polyfills for newer *runtime methods*. Several shipped dependencies use
 * ES2019–2022 methods (e.g. `input-otp` calls `String.prototype.replaceAll`),
 * which crashes the whole app with a blank screen on phones that lack them.
 *
 * This module MUST be imported first in the entry point, before any app code.
 * Every patch is feature-guarded so modern browsers are untouched.
 */

/* eslint-disable no-extend-native */

// String.prototype.replaceAll (ES2021) — used by input-otp (OTP/PIN inputs).
if (typeof (String.prototype as any).replaceAll !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (String.prototype as any).replaceAll = function (search: any, replacement: any) {
    if (Object.prototype.toString.call(search) === '[object RegExp]') {
      // A RegExp must be global for replaceAll semantics.
      if (!search.global) {
        throw new TypeError('replaceAll must be called with a global RegExp');
      }
      return this.replace(search, replacement);
    }
    return this.split(String(search)).join(
      typeof replacement === 'function' ? undefined : String(replacement),
    );
  };
}

// Array.prototype.at / String.prototype.at (ES2022).
function atPolyfill(this: any, n: number) {
  n = Math.trunc(n) || 0;
  if (n < 0) n += this.length;
  if (n < 0 || n >= this.length) return undefined;
  return this[n];
}
if (typeof (Array.prototype as any).at !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).at = atPolyfill;
}
if (typeof (String.prototype as any).at !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (String.prototype as any).at = atPolyfill;
}

// Object.hasOwn (ES2022).
if (typeof (Object as any).hasOwn !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Object as any).hasOwn = function (obj: any, prop: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };
}

// Array.prototype.flat / flatMap (ES2019).
if (typeof (Array.prototype as any).flat !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).flat = function (depth = 1) {
    const flatten = (arr: any[], d: number): any[] =>
      d < 1
        ? arr.slice()
        : arr.reduce(
            (acc: any[], v: any) =>
              acc.concat(Array.isArray(v) ? flatten(v, d - 1) : v),
            [],
          );
    return flatten(this, depth);
  };
}
if (typeof (Array.prototype as any).flatMap !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).flatMap = function (cb: any, thisArg: any) {
    return this.map((v: any, i: number, a: any[]) => cb.call(thisArg, v, i, a)).flat();
  };
}

// Promise.allSettled (ES2020).
if (typeof (Promise as any).allSettled !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).allSettled = function (promises: any[]) {
    return Promise.all(
      Array.from(promises).map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason }),
        ),
      ),
    );
  };
}

// Promise.any (ES2021).
if (typeof (Promise as any).any !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).any = function (promises: any[]) {
    return new Promise((resolve, reject) => {
      const arr = Array.from(promises);
      let rejections = 0;
      const errors: any[] = [];
      if (arr.length === 0) reject(new Error('All promises were rejected'));
      arr.forEach((p, i) => {
        Promise.resolve(p).then(resolve, (err) => {
          errors[i] = err;
          rejections += 1;
          if (rejections === arr.length) reject(new Error('All promises were rejected'));
        });
      });
    });
  };
}

// globalThis (ES2020) — some deps reference it directly.
if (typeof (window as any).globalThis === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).globalThis = window;
}

export {};
