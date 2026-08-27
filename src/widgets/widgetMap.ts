import type { LGraphNode } from "@/LGraphNode"
import type {
  IBaseWidget,
  IBooleanWidget,
  IButtonWidget,
  IColorWidget,
  IComboWidget,
  ICustomWidget,
  IGradientSliderWidget,
  IKnobWidget,
  INumericWidget,
  ISliderWidget,
  IStringWidget,
  IWidget,
  TWidgetType,
} from "@/types/widgets"

import { toClass } from "@/utils/type"

import { BaseWidget } from "./BaseWidget"
import { BooleanWidget } from "./BooleanWidget"
import { ButtonWidget } from "./ButtonWidget"
import { ColorWidget } from "./ColorWidget"
import { ComboWidget } from "./ComboWidget"
import { GradientSliderWidget } from "./GradientSliderWidget"
import { KnobWidget } from "./KnobWidget"
import { LegacyWidget } from "./LegacyWidget"
import { NumberWidget } from "./NumberWidget"
import { SliderWidget } from "./SliderWidget"
import { TextWidget } from "./TextWidget"

/**
 * Maps each {@link TWidgetType} string to its concrete {@link BaseWidget} subclass.
 *
 * Used by {@link toConcreteWidget} for return-type inference. Unknown type keys fall back to
 * {@link BaseWidget}.
 */
export type WidgetTypeMap = {
  /** {@link ButtonWidget} */
  button: ButtonWidget
  /** {@link BooleanWidget} */
  toggle: BooleanWidget
  /** {@link SliderWidget} */
  slider: SliderWidget
  /** {@link GradientSliderWidget} */
  gradientslider: GradientSliderWidget
  /** {@link KnobWidget} */
  knob: KnobWidget
  /** {@link ComboWidget} */
  combo: ComboWidget
  /** {@link NumberWidget} */
  number: NumberWidget
  /** {@link TextWidget} (`type: "string"`) */
  string: TextWidget
  /** {@link TextWidget} (`type: "text"`) */
  text: TextWidget
  /** {@link ColorWidget} */
  color: ColorWidget
  /** {@link LegacyWidget} for unrecognized custom POJOs */
  custom: LegacyWidget
  [key: string]: BaseWidget
}

/**
 * Converts a widget POJO (or passes through an existing {@link BaseWidget}) into a typed instance.
 * @param widget Widget definition or existing instance.
 * @param node Node that will own the widget.
 * @param wrapLegacyWidgets When `true` (default), unknown types are wrapped in {@link LegacyWidget}.
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
    case "gradientslider": return toClass(GradientSliderWidget, narrowedWidget, node)
    case "knob": return toClass(KnobWidget, narrowedWidget, node)
    case "combo": return toClass(ComboWidget, narrowedWidget, node)
    case "number": return toClass(NumberWidget, narrowedWidget, node)
    case "string": return toClass(TextWidget, narrowedWidget, node)
    case "text": return toClass(TextWidget, narrowedWidget, node)
    case "color": return toClass(ColorWidget, narrowedWidget, node)
    default: {
      if (wrapLegacyWidgets) return toClass(LegacyWidget, widget, node)
    }
  }
}

// #region Type Guards

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IButtonWidget}.
 * @param widget Widget to test.
 */
export function isButtonWidget(widget: IBaseWidget): widget is IButtonWidget {
  return widget.type === "button"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IBooleanWidget}.
 * @param widget Widget to test.
 */
export function isBooleanWidget(widget: IBaseWidget): widget is IBooleanWidget {
  return widget.type === "toggle"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link ISliderWidget}.
 * @param widget Widget to test.
 */
export function isSliderWidget(widget: IBaseWidget): widget is ISliderWidget {
  return widget.type === "slider"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IGradientSliderWidget}.
 * @param widget Widget to test.
 */
export function isGradientSliderWidget(widget: IBaseWidget): widget is IGradientSliderWidget {
  return widget.type === "gradientslider"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IColorWidget}.
 * @param widget Widget to test.
 */
export function isColorWidget(widget: IBaseWidget): widget is IColorWidget {
  return widget.type === "color"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IKnobWidget}.
 * @param widget Widget to test.
 */
export function isKnobWidget(widget: IBaseWidget): widget is IKnobWidget {
  return widget.type === "knob"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IComboWidget}.
 * @param widget Widget to test.
 */
export function isComboWidget(widget: IBaseWidget): widget is IComboWidget {
  return widget.type === "combo"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link INumericWidget}.
 * @param widget Widget to test.
 */
export function isNumberWidget(widget: IBaseWidget): widget is INumericWidget {
  return widget.type === "number"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IStringWidget} (`type: "string"`).
 * @param widget Widget to test.
 */
export function isStringWidget(widget: IBaseWidget): widget is IStringWidget {
  return widget.type === "string"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link IStringWidget} (`type: "text"`).
 * @param widget Widget to test.
 */
export function isTextWidget(widget: IBaseWidget): widget is IStringWidget {
  return widget.type === "text"
}

/**
 * Type guard: narrows {@link IBaseWidget} to {@link ICustomWidget}.
 * @param widget Widget to test.
 */
export function isCustomWidget(widget: IBaseWidget): widget is ICustomWidget {
  return widget.type === "custom"
}

// #endregion Type Guards
