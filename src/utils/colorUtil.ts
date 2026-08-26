type RGB = { r: number, g: number, b: number }

export function hexToRgb(hex: string): RGB {
  let r = 0
  let g = 0
  let b = 0
  if (hex.length === 4 || hex.length === 5) {
    r = parseInt(hex.at(1)! + hex.at(1), 16)
    g = parseInt(hex.at(2)! + hex.at(2), 16)
    b = parseInt(hex.at(3)! + hex.at(3), 16)
  } else if (hex.length === 7 || hex.length === 9) {
    r = parseInt(hex.slice(1, 3), 16)
    g = parseInt(hex.slice(3, 5), 16)
    b = parseInt(hex.slice(5, 7), 16)
  }
  return { r, g, b }
}

export function luminance({ r, g, b }: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function readableTextColor(hex: string): string {
  const rgb = hexToRgb(hex)
  let { r, g, b } = rgb
  const lum = luminance(rgb)
  const MIN = 130
  if (lum < MIN) {
    const t = (MIN - lum) / (255 - lum)
    r = Math.round(r + (255 - r) * t)
    g = Math.round(g + (255 - g) * t)
    b = Math.round(b + (255 - b) * t)
  }
  return `rgb(${r},${g},${b})`
}
