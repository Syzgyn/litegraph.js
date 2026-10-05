import { afterEach, describe, expect, test, vi } from "vitest"

import { ContextMenu } from "@/ContextMenu"
import { LGraphCanvas } from "@/LGraphCanvas"

describe("ContextMenu XSS", () => {
  const menus: ContextMenu[] = []

  afterEach(() => {
    for (const menu of menus)
      menu.close()
    menus.length = 0
  })

  test("renders string entries with textContent", () => {
    const payload = "<img src=x onerror=window.__xss=1>"
    const menu = new ContextMenu([payload], { title: payload })
    menus.push(menu)

    const entry = menu.root.querySelector(":scope .litemenu-entry")
    expect(entry?.textContent).toBe(payload)
    expect(entry?.innerHTML).not.toContain("<img")
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined()
  })

  test("renders object entries with plain content via textContent", () => {
    const payload = "malicious'; DROP TABLE nodes; --"
    const menu = new ContextMenu([{ content: payload, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(":scope .litemenu-entry")
    expect(entry?.textContent).toBe(payload)
    expect(entry?.innerHTML).toBe(payload)
  })

  test("strips disallowed HTML from object content", () => {
    const payload = "<img src=x onerror=window.__xss=1>"
    const menu = new ContextMenu([{ content: payload, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(":scope .litemenu-entry")
    expect(entry?.textContent).toBe("")
    expect(entry?.querySelector(":scope img")).toBeNull()
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined()
  })

  test("sanitizes intentional HTML content", () => {
    const menu = new ContextMenu([
      {
        content: "<span style=\"color: red\">ok</span><script>bad()</script>",
        callback: () => {},
      },
    ], {})
    menus.push(menu)

    const entry = menu.root.querySelector(":scope .litemenu-entry")
    expect(entry?.innerHTML).toBe("<span style=\"color: red\">ok</span>")
    expect(entry?.querySelector(":scope script")).toBeNull()
  })

  test("allows styled span elements used by color menus", () => {
    const html = "<span style=\"display: block; color: #999; padding-left: 4px;\">No color</span>"
    const menu = new ContextMenu([{ content: html, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(":scope .litemenu-entry")
    expect(entry?.textContent).toContain("No color")
    expect(entry?.innerHTML).toMatch(/display:\s*block/)
  })

  test("removes disallowed style properties from sanitized HTML content", () => {
    const html = "<span style=\"color: red; background: url(javascript:alert(1))\">x</span>"
    const menu = new ContextMenu([{ content: html, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(":scope .litemenu-entry")
    expect(entry?.innerHTML).toBe("<span style=\"color: red\">x</span>")
  })

  test("renders menu title with textContent", () => {
    const payload = "<b onclick=alert(1)>title</b>"
    const menu = new ContextMenu([], { title: payload })
    menus.push(menu)

    const title = menu.root.querySelector(":scope .litemenu-title")
    expect(title?.textContent).toBe(payload)
    expect(title?.innerHTML).not.toContain("<b")
  })
})

describe("ContextMenu focus", () => {
  test("returns focus to the canvas after the root menu closes", async () => {
    const canvasElement = document.createElement("canvas")
    const refocus = vi.fn(() => canvasElement.focus())
    LGraphCanvas.activeCanvas = {
      canvas: canvasElement,
      refocus,
    } as LGraphCanvas

    const focusSpy = vi.spyOn(canvasElement, "focus")

    const menu = new ContextMenu(
      [{ title: "Action", callback: () => {} }],
      { event: new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) },
    )

    menu.root.querySelector(":scope .litemenu-entry")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    )

    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(refocus).toHaveBeenCalled()
    expect(focusSpy).toHaveBeenCalled()
  })

  test("does not steal focus from a graph dialog opened by a menu item", async () => {
    const canvasElement = document.createElement("canvas")
    LGraphCanvas.activeCanvas = {
      canvas: canvasElement,
      refocus: () => canvasElement.focus(),
    } as LGraphCanvas

    const focusSpy = vi.spyOn(canvasElement, "focus")

    const dialog = document.createElement("div")
    dialog.className = "graphdialog"
    const input = document.createElement("input")
    dialog.append(input)
    document.body.append(dialog)

    const menu = new ContextMenu(
      [
        {
          title: "Edit",
          callback: () => {
            input.focus()
          },
        },
      ],
      { event: new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }) },
    )

    menu.root.querySelector(":scope .litemenu-entry")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    )

    await new Promise<void>(resolve => queueMicrotask(resolve))

    expect(document.activeElement).toBe(input)
    expect(focusSpy).not.toHaveBeenCalled()

    dialog.remove()
  })
})
