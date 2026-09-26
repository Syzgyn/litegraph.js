export type CanvasMeasureTextFn = (text: string, fontStyle?: string) => number

let measureText: CanvasMeasureTextFn | undefined

/** @internal Set by `LGraphCanvas` when a canvas context is available. */
export function setCanvasMeasureText(fn: CanvasMeasureTextFn | undefined): void {
  measureText = fn
}

export function getCanvasMeasureText(): CanvasMeasureTextFn | undefined {
  return measureText
}

export function canvasMeasureText(text: string, fontStyle?: string): number {
  return measureText?.(text, fontStyle) ?? 0
}
