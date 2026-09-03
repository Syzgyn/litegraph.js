import { cachedMeasureText } from "@/utils/textMeasureCache"

const WORD_BREAK = /(\s+)/
const ESTIMATED_CHAR_WIDTH = 7

/**
 * Splits `text` into display lines that fit within `maxWidth` using `ctx` for measurement.
 * Existing newlines are preserved; each paragraph is wrapped independently.
 */
export function wrapTextToLines(
  text: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D,
): string[] {
  if (maxWidth <= 0) return text ? [text] : []

  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("")
      continue
    }

    let currentLine = ""
    for (const segment of paragraph.split(WORD_BREAK)) {
      if (!segment) continue

      const candidate = currentLine ? currentLine + segment : segment
      if (cachedMeasureText(ctx, candidate) <= maxWidth) {
        currentLine = candidate
        continue
      }

      if (currentLine) lines.push(currentLine.trimEnd())

      if (cachedMeasureText(ctx, segment) <= maxWidth) {
        currentLine = segment
        continue
      }

      let fragment = ""
      for (const char of segment) {
        const next = fragment + char
        if (fragment && cachedMeasureText(ctx, next) > maxWidth) {
          lines.push(fragment)
          fragment = char
        } else {
          fragment = next
        }
      }
      currentLine = fragment
    }

    if (currentLine) lines.push(currentLine.trimEnd())
  }

  return lines.length ? lines : [""]
}

function estimateLineCount(text: string, maxWidth: number): number {
  const charsPerLine = Math.max(1, Math.floor(maxWidth / ESTIMATED_CHAR_WIDTH))
  let lines = 0
  for (const paragraph of text.split("\n")) {
    lines += Math.max(1, Math.ceil(paragraph.length / charsPerLine))
  }
  return lines
}

/**
 * Returns the pixel height required to render `text` wrapped to `width`.
 * @param ctx Optional measurement context; when omitted a temporary canvas is used.
 */
export function measureWrappedTextHeight(
  text: string,
  width: number,
  {
    font,
    lineHeight,
    horizontalPadding = 0,
    verticalPadding = 0,
  }: {
    font: string
    lineHeight: number
    horizontalPadding?: number
    verticalPadding?: number
  },
  ctx?: CanvasRenderingContext2D | null,
): number {
  const innerWidth = Math.max(0, width - horizontalPadding)
  const measureCtx = ctx ?? document.createElement("canvas").getContext("2d")
  if (measureCtx) measureCtx.font = font

  const lineCount = measureCtx
    ? wrapTextToLines(text, innerWidth, measureCtx).length
    : estimateLineCount(text, innerWidth)

  return lineCount * lineHeight + verticalPadding * 2
}
