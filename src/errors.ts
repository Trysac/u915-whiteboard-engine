/**
 * Error codes produced by `@trysac/whiteboard-engine`.
 */
export type WhiteboardErrorCode =
  | "invalid_shape"
  | "too_many_shapes"
  | "input_too_large"
  | "invalid_op"
  | "unknown_shape";

/**
 * Base error class for all whiteboard engine failures.
 */
export class WhiteboardError extends Error {
  public readonly code: WhiteboardErrorCode;

  public constructor(code: WhiteboardErrorCode, message: string) {
    const safeMessage = message.length > 200 ? `${message.slice(0, 197)}...` : message;
    super(safeMessage);
    this.name = "WhiteboardError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
