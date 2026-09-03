import type { LGraphNode } from "@/LGraphNode"
import type {
  IBaseWidget,
  IBooleanWidget,
  IButtonWidget,
  IColorWidget,
  IComboWidget,
  ICustomWidget,
  IKnobWidget,
  INumericWidget,
  ISliderWidget,
  IStringWidget,
  ITextPreviewWidget,
  IWidget,
  TWidgetType,
} from "@/types/widgets"

import { toClass } from "@/utils/type"

import { BaseWidget } from "./BaseWidget"
import { BooleanWidget } from "./BooleanWidget"
import { ButtonWidget } from "./ButtonWidget"
import { ColorWidget } from "./ColorWidget"
import { ComboWidget } from "./ComboWidget"
import { KnobWidget } from "./KnobWidget"
import { LegacyWidget } from "./LegacyWidget"
import { NumberWidget } from "./NumberWidget"
import { SliderWidget } from "./SliderWidget"
import { TextPreviewWidget } from "./TextPreviewWidget"
import { TextWidget } from "./TextWidget"

/**
 * Maps each `TWidgetType` string to its concrete `BaseWidget` subclass.
 *
 * Used by `toConcreteWidget` for return-type inference. Unknown type keys fall back to
 * `BaseWidget`.
 */
export type WidgetTypeMap = {
  /** `ButtonWidget` */
  button: ButtonWidget
  /** `BooleanWidget` */
  toggle: BooleanWidget
  /** `SliderWidget` */
  slider: SliderWidget
  /** `KnobWidget` */
  knob: KnobWidget
  /** `ComboWidget` */
  combo: ComboWidget
  /** `NumberWidget` */
  number: NumberWidget
  /** `TextWidget` (`type: "string"`) */
  string: TextWidget
  /** `TextWidget` (`type: "text"`) */
  text: TextWidget
  /** `TextPreviewWidget` */
  textpreview: TextPreviewWidget
  /** `ColorWidget` */
  color: ColorWidget
  /** `LegacyWidget` for unrecognized custom POJOs */
  custom: LegacyWidget
  [key: string]: BaseWidget
}

/**
 * Converts a widget POJO (or passes through an existing `BaseWidget`) into a typed instance.
 * @param widget Widget definition or existing instance.
 * @param node Node that will own the widget.
 * @param wrapLegacyWidgets When `true` (default), unknown types are wrapped in `LegacyWidget`.
 * When `false`, unknown types yield `undefined`.
 * @returns Concrete widget matching `widget.type`, or the original instance if already concrete.
 */
export function toConcreteWidget<TWidget extends IWidget | IBaseWidget>(
  widget: TWidget,
  node: LGraphNode,
  wrapLegacyWidgets?: true,
): WidgetTypeMap[TWidget["type"]]
export function toConcreteWidget<TWidget extends IWidget | IBaseWidget>(
  widget: TWidget,
  node: LGraphNode,
  wrapLegacyWidgets: false): WidgetTypeMap[TWidget["type"]] | undefined
export function toConcreteWidget<TWidget extends IWidget | IBaseWidget>(
  widget: TWidget,
  node: LGraphNode,
  wrapLegacyWidgets = true,
): WidgetTypeMap[TWidget["type"]] | undefined {
  if (widget instanceof BaseWidget) return widget

  // Assertion: TypeScript has no concept of "all strings except X"
  type RemoveBaseWidgetType<T> = T extends { type: TWidgetType } ? T : never
  const narrowedWidget = widget as RemoveBaseWidgetType<TWidget>

  switch (narrowedWidget.type) {
    case "button": return toClass(ButtonWidget, narrowedWidget, node)
    case "toggle": return toClass(BooleanWidget, narrowedWidget, node)
    case "slider": return toClass(SliderWidget, narrowedWidget, node)
    case "knob": return toClass(KnobWidget, narrowedWidget, node)
    case "combo": return toClass(ComboWidget, narrowedWidget, node)
    case "number": return toClass(NumberWidget, narrowedWidget, node)
    case "string": return toClass(TextWidget, narrowedWidget, node)
    case "text": return toClass(TextWidget, narrowedWidget, node)
    case "textpreview": return toClass(TextPreviewWidget, narrowedWidget, node)
    case "color": return toClass(ColorWidget, narrowedWidget, node)
    default: {
      if (wrapLegacyWidgets) return toClass(LegacyWidget, widget, node)
    }
  }
}

// #region Type Guards

/**
 * Type guard: narrows `IBaseWidget` to `IButtonWidget`.
 * @param widget Widget to test.
 */
export function isButtonWidget(widget: IBaseWidget): widget is IButtonWidget {
  return widget.type === "button"
}

/**
 * Type guard: narrows `IBaseWidget` to `IBooleanWidget`.
 * @param widget Widget to test.
 */
export function isBooleanWidget(widget: IBaseWidget): widget is IBooleanWidget {
  return widget.type === "toggle"
}

/**
 * Type guard: narrows `IBaseWidget` to `ISliderWidget`.
 * @param widget Widget to test.
 */
export function isSliderWidget(widget: IBaseWidget): widget is ISliderWidget {
  return widget.type === "slider"
}

/**
 * Type guard: narrows `IBaseWidget` to `IColorWidget`.
 * @param widget Widget to test.
 */
export function isColorWidget(widget: IBaseWidget): widget is IColorWidget {
  return widget.type === "color"
}

/**
 * Type guard: narrows `IBaseWidget` to `IKnobWidget`.
 * @param widget Widget to test.
 */
export function isKnobWidget(widget: IBaseWidget): widget is IKnobWidget {
  return widget.type === "knob"
}

/**
 * Type guard: narrows `IBaseWidget` to `IComboWidget`.
 * @param widget Widget to test.
 */
export function isComboWidget(widget: IBaseWidget): widget is IComboWidget {
  return widget.type === "combo"
}

/**
 * Type guard: narrows `IBaseWidget` to `INumericWidget`.
 * @param widget Widget to test.
 */
export function isNumberWidget(widget: IBaseWidget): widget is INumericWidget {
  return widget.type === "number"
}

/**
 * Type guard: narrows `IBaseWidget` to `IStringWidget` (`type: "string"`).
 * @param widget Widget to test.
 */
export function isStringWidget(widget: IBaseWidget): widget is IStringWidget {
  return widget.type === "string"
}

/**
 * Type guard: narrows `IBaseWidget` to `IStringWidget` (`type: "text"`).
 * @param widget Widget to test.
 */
export function isTextWidget(widget: IBaseWidget): widget is IStringWidget {
  return widget.type === "text"
}

export function isTextPreviewWidget(widget: IBaseWidget): widget is ITextPreviewWidget {
  return widget.type === "textpreview"
}

/**
 * Type guard: narrows `IBaseWidget` to `ICustomWidget`.
 * @param widget Widget to test.
 */
export function isCustomWidget(widget: IBaseWidget): widget is ICustomWidget {
  return widget.type === "custom"
}

// #endregion Type Guards
