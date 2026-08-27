/**
 * Error thrown when a slot index does not correspond to an existing input or output slot.
 *
 * Used by `ExecutableNodeDTO` when resolving links across flattened subgraph execution
 * trees. Differs from `InvalidLinkError`, which indicates a missing link record rather
 * than an out-of-bounds slot index.
 * @see `ExecutableNodeDTO.resolveInput`
 * @see `ExecutableNodeDTO.resolveOutput`
 */
export class SlotIndexError extends Error {
  /**
   * @param message Human-readable description of the invalid slot index and node context.
   * Defaults to a generic out-of-bounds message.
   * @param cause Optional underlying error that triggered this failure.
   */
  constructor(message: string = "Attempted to access a slot that was out of bounds.", cause?: Error) {
    super(message, { cause })
    this.name = "SlotIndexError"
  }
}
