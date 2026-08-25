/** Discriminator for node slot direction — input (receives data) or output (sends data). */
export enum NodeSlotType {
  /** An input slot that receives data from upstream connections. */
  INPUT = 1,
  /** An output slot that sends data to downstream connections. */
  OUTPUT = 2,
}

/**
 * Visual shape used when rendering nodes and slots on the canvas.
 *
 * Applied to both node bodies and individual slot indicators. Slot-specific shapes
 * (arrow, grid, hollow circle) are a subset of this enum.
 */
export enum RenderShape {
  /** Rectangle with square corners. */
  BOX = 1,
  /** Rectangle with rounded corners. */
  ROUND = 2,
  /** Filled circle. */
  CIRCLE = 3,
  /** Two rounded corners: top-left and bottom-right (card-style). */
  CARD = 4,
  /** Slot shape: directional arrow. */
  ARROW = 5,
  /** Slot shape: 3×3 dot grid. */
  GRID = 6,
  /** Slot shape: hollow (stroked) circle. */
  HollowCircle = 7,
}

/**
 * Bit flags indicating what canvas item(s) the pointer is currently hovering over.
 *
 * Multiple flags may be set simultaneously. Use {@link hasFlag} to test individual flags.
 */
export enum CanvasItem {
  /** No items / none. */
  Nothing = 0,
  /** At least one node. */
  Node = 1,
  /** At least one group. */
  Group = 1 << 1,
  /** A reroute point (not its connecting path). */
  Reroute = 1 << 2,
  /** The path of a link. */
  Link = 1 << 3,
  /** A reroute slot. */
  RerouteSlot = 1 << 5,
  /** A subgraph input or output boundary node. */
  SubgraphIoNode = 1 << 6,
  /** A subgraph input or output boundary slot. */
  SubgraphIoSlot = 1 << 7,
}

/**
 * Direction that a link segment flows towards when leaving or entering a slot.
 *
 * For example, horizontal output slots default to {@link RIGHT}, meaning the link
 * exits the slot heading rightward.
 */
export enum LinkDirection {
  /** No preferred direction. */
  NONE = 0,
  /** Link flows upward. */
  UP = 1,
  /** Link flows downward. */
  DOWN = 2,
  /** Link flows leftward. */
  LEFT = 3,
  /** Link flows rightward. */
  RIGHT = 4,
  /** Link flows toward the centre (used for floating/dragging links). */
  CENTER = 5,
}

/**
 * Algorithm used to calculate the visual path of links between nodes.
 *
 * Configured globally via {@link LiteGraph} link render settings.
 */
export enum LinkRenderType {
  /** Link is not rendered. */
  HIDDEN_LINK = -1,
  /**
   * Short straight segments from each slot, then a direct line between them.
   * @see LinkDirection
   */
  STRAIGHT_LINK = 0,
  /** 90° angles producing clean, box-like paths. */
  LINEAR_LINK = 1,
  /** Smooth curved spline paths (default). */
  SPLINE_LINK = 2,
}

/** Shape of the marker drawn at the midpoint of a link. */
export enum LinkMarkerShape {
  /** Do not display markers. */
  None = 0,
  /** Small circles at link midpoints (default). */
  Circle = 1,
  /** Directional arrows at link midpoints. */
  Arrow = 2,
}

/** Controls how a node's title bar is rendered. */
export enum TitleMode {
  /** Standard visible title bar. */
  NORMAL_TITLE = 0,
  /** Title bar is not rendered. */
  NO_TITLE = 1,
  /** Title bar is rendered with a transparent background. */
  TRANSPARENT_TITLE = 2,
  /** Title bar is hidden until the node is hovered or selected. */
  AUTOHIDE_TITLE = 3,
}

/** Determines when a node's execution logic is invoked. */
export enum LGraphEventMode {
  /** Node executes on every graph tick. */
  ALWAYS = 0,
  /** Node executes only when it receives an event input. */
  ON_EVENT = 1,
  /** Node never executes automatically. */
  NEVER = 2,
  /** Node executes only when explicitly triggered. */
  ON_TRIGGER = 3,
  /** Node passes inputs through without executing its own logic. */
  BYPASS = 4,
}

/** Named easing functions for animated transitions on the canvas. */
export enum EaseFunction {
  /** Constant-rate linear interpolation. */
  LINEAR = "linear",
  /** Accelerating from zero velocity. */
  EASE_IN_QUAD = "easeInQuad",
  /** Decelerating to zero velocity. */
  EASE_OUT_QUAD = "easeOutQuad",
  /** Accelerating then decelerating. */
  EASE_IN_OUT_QUAD = "easeInOutQuad",
}

/**
 * Bit flags for alignment and positioning operations on canvas items.
 *
 * Flags may be combined (e.g. {@link TopLeft} = {@link Top} | {@link Left}).
 * Use {@link hasFlag} to test individual flags.
 */
export enum Alignment {
  /** No alignment constraint. */
  None = 0,
  /** Align to the top edge. */
  Top = 1,
  /** Align to the bottom edge. */
  Bottom = 1 << 1,
  /** Align to the vertical middle. */
  Middle = 1 << 2,
  /** Align to the left edge. */
  Left = 1 << 3,
  /** Align to the right edge. */
  Right = 1 << 4,
  /** Align to the horizontal centre. */
  Centre = 1 << 5,
  /** Top-left corner. */
  TopLeft = Top | Left,
  /** Top edge, horizontally centred. */
  TopCentre = Top | Centre,
  /** Top-right corner. */
  TopRight = Top | Right,
  /** Left edge, vertically centred. */
  MidLeft = Left | Middle,
  /** Horizontal and vertical centre. */
  MidCentre = Middle | Centre,
  /** Right edge, vertically centred. */
  MidRight = Right | Middle,
  /** Bottom-left corner. */
  BottomLeft = Bottom | Left,
  /** Bottom edge, horizontally centred. */
  BottomCentre = Bottom | Centre,
  /** Bottom-right corner. */
  BottomRight = Bottom | Right,
}

/**
 * Tests whether a single bit flag is set in a flag set.
 * @param flagSet The combined flag value to inspect.
 * @param flag The individual flag bit to test for.
 * @returns `true` if {@link flag} is fully set in {@link flagSet}.
 */
export function hasFlag(flagSet: number, flag: number): boolean {
  return (flagSet & flag) === flag
}
