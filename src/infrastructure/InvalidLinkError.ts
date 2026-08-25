/**
 * Error thrown when link resolution encounters a missing or inconsistent {@link LLink}.
 *
 * Used during subgraph execution planning when {@link ExecutableNodeDTO} cannot find a link
 * record, upstream node, or outer-graph connection that an input slot references. Indicates
 * corrupted graph state or a deserialisation mismatch rather than a user input mistake.
 * @see {@link ExecutableNodeDTO.resolveInput}
 * @see {@link SlotIndexError}
 */
export class InvalidLinkError extends Error {
  /**
   * @param message Human-readable description of which link or node could not be resolved.
   * Defaults to a generic invalid-link message.
   * @param cause Optional underlying error that triggered this failure.
   */
  constructor(message: string = "Attempted to access a link that was invalid.", cause?: Error) {
    super(message, { cause })
    this.name = "InvalidLinkError"
  }
}
