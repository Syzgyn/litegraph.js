import { afterEach, describe, expect, test } from "vitest"

import { ContextMenu } from "@/ContextMenu"

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

    const entry = menu.root.querySelector(".litemenu-entry")
    expect(entry?.textContent).toBe(payload)
    expect(entry?.innerHTML).not.toContain("<img")
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined()
  })

  test("renders object entries with plain content via textContent", () => {
    const payload = "malicious'; DROP TABLE nodes; --"
    const menu = new ContextMenu([{ content: payload, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(".litemenu-entry")
    expect(entry?.textContent).toBe(payload)
    expect(entry?.innerHTML).toBe(payload)
  })

  test("strips disallowed HTML from object content", () => {
    const payload = "<img src=x onerror=window.__xss=1>"
    const menu = new ContextMenu([{ content: payload, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(".litemenu-entry")
    expect(entry?.textContent).toBe("")
    expect(entry?.querySelector("img")).toBeNull()
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

    const entry = menu.root.querySelector(".litemenu-entry")
    expect(entry?.innerHTML).toBe("<span style=\"color: red\">ok</span>")
    expect(entry?.querySelector("script")).toBeNull()
  })

  test("allows styled span elements used by color menus", () => {
    const html = "<span style=\"display: block; color: #999; padding-left: 4px;\">No color</span>"
    const menu = new ContextMenu([{ content: html, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(".litemenu-entry")
    expect(entry?.textContent).toContain("No color")
    expect(entry?.innerHTML).toMatch(/display:\s*block/)
  })

  test("removes disallowed style properties from sanitized HTML content", () => {
    const html = "<span style=\"color: red; background: url(javascript:alert(1))\">x</span>"
    const menu = new ContextMenu([{ content: html, callback: () => {} }], {})
    menus.push(menu)

    const entry = menu.root.querySelector(".litemenu-entry")
    expect(entry?.innerHTML).toBe("<span style=\"color: red\">x</span>")
  })

  test("renders menu title with textContent", () => {
    const payload = "<b onclick=alert(1)>title</b>"
    const menu = new ContextMenu([], { title: payload })
    menus.push(menu)

    const title = menu.root.querySelector(".litemenu-title")
    expect(title?.textContent).toBe(payload)
    expect(title?.innerHTML).not.toContain("<b")
  })
})
