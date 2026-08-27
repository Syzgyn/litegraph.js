// @ts-expect-error Polyfill
Symbol.dispose ??= Symbol("Symbol.dispose")
// @ts-expect-error Polyfill
Symbol.asyncDispose ??= Symbol("Symbol.asyncDispose")

/**
 * Installs runtime polyfills required by litegraph on older browsers.
 *
 * - Adds `CanvasRenderingContext2D.roundRect` when missing.
 * - Adds `window.requestAnimationFrame` fallback when missing.
 *
 * Called automatically when importing `litegraph`.
 */
export function loadPolyfills() {
  if (
    typeof window != "undefined" &&
    window.CanvasRenderingContext2D &&
    !window.CanvasRenderingContext2D.prototype.roundRect
  ) {
    // @ts-expect-error Slightly broken polyfill - radius_low not impl. anywhere
    window.CanvasRenderingContext2D.prototype.roundRect = function (
      x: number,
      y: number,
      w: number,
      h: number,
      radius: number | number[],
      radiusLow: number | number[],
    ) {
      if (radius === 0) {
        this.rect(x, y, w, h)
        return
      }

      let topLeftRadius
      let topRightRadius
      let bottomLeftRadius
      let bottomRightRadius

      if (radiusLow === undefined) radiusLow = radius

      // make it compatible with official one
      if (Array.isArray(radius)) {
        if (radius.length == 1) {
          topLeftRadius = topRightRadius = bottomLeftRadius = bottomRightRadius = radius[0]
        } else if (radius.length == 2) {
          topLeftRadius = bottomRightRadius = radius[0]
          topRightRadius = bottomLeftRadius = radius[1]
        } else if (radius.length == 4) {
          topLeftRadius = radius[0]
          topRightRadius = radius[1]
          bottomLeftRadius = radius[2]
          bottomRightRadius = radius[3]
        } else {
          return
        }
      } else {
        // old using numbers
        topLeftRadius = radius || 0
        topRightRadius = radius || 0

        const low = !Array.isArray(radiusLow) && radiusLow ? radiusLow : 0
        bottomLeftRadius = low
        bottomRightRadius = low
      }

      // top right
      this.moveTo(x + topLeftRadius, y)
      this.lineTo(x + w - topRightRadius, y)
      this.quadraticCurveTo(x + w, y, x + w, y + topRightRadius)

      // bottom right
      this.lineTo(x + w, y + h - bottomRightRadius)
      this.quadraticCurveTo(
        x + w,
        y + h,
        x + w - bottomRightRadius,
        y + h,
      )

      // bottom left
      this.lineTo(x + bottomRightRadius, y + h)
      this.quadraticCurveTo(x, y + h, x, y + h - bottomLeftRadius)

      // top left
      this.lineTo(x, y + bottomLeftRadius)
      this.quadraticCurveTo(x, y, x + topLeftRadius, y)
    }
  }

  if (typeof window != "undefined" && !window["requestAnimationFrame"]) {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    window.requestAnimationFrame =
      // @ts-expect-error Legacy code
      window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame ||
      function (callback) {
        window.setTimeout(callback, 1000 / 60)
      }
  }
}
