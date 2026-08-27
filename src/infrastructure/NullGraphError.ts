/**
 * Error thrown when canvas or node code requires an `LGraph` reference that is missing.
 *
 * `LGraphCanvas` and related interaction handlers throw this when `graph` is `null` or
 * `undefined` at a point where graph operations are mandatory (rendering, hit-testing, linking,
 * etc.). Callers should ensure a graph is assigned via `LGraphCanvas.setGraph` before use.
 * @see `LGraphCanvas.graph`
 */
export class NullGraphError extends Error {
  /**
   * @param message Human-readable description of which graph reference was missing.
   * Defaults to a generic null-graph message.
   * @param cause Optional underlying error that triggered this failure.
   */
  constructor(message: string = "Attempted to access LGraph reference that was null or undefined.", cause?: Error) {
    super(message, { cause })
    this.name = "NullGraphError"
  }
}
