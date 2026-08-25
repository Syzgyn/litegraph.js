/** Conservative pointerdown-style check: middle button or strict middle-only buttons bitmask. */
export function isMiddlePointerInput(event: MouseEvent): boolean {
  return event.button === 1 || event.buttons === 4
}

/** Pointermove-style check so chorded drags with the middle button still pan. */
export function isMiddleButtonHeld(event: MouseEvent): boolean {
  return (event.buttons & 4) === 4
}

/** Pointerup/auxclick-style check for middle-button release events. */
export function isMiddleButtonEvent(event: MouseEvent): boolean {
  return event.button === 1
}
