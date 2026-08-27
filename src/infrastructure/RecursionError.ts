/**
 * Error thrown when infinite recursion is detected during link or subgraph resolution.
 *
 * `ExecutableNodeDTO` and `SubgraphNode` track visited node/slot pairs while
 * traversing nested subgraph boundaries. Revisiting the same unique identifier indicates a
 * circular link chain that cannot be resolved to a finite upstream source.
 * @see `ExecutableNodeDTO.resolveInput`
 * @see `ExecutableNodeDTO.resolveOutput`
 * @see `SubgraphNode`
 */
export class RecursionError extends Error {
  /**
   * @param subject Descriptive message identifying the circular reference, including node,
   * slot, and subgraph path context where available.
   */
  constructor(subject: string) {
    super(subject)
    this.name = "RecursionError"
  }
}
