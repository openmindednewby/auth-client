/**
 * `BffRequestError` — what a failed state-changing BFF call throws.
 *
 * Before 4.5.0 the client threw a plain `Error("<label> failed with status N")`
 * and dropped the response body, so a consumer could never tell a 409
 * `USER_EXISTS` from a 429 or a 5xx. The message text is unchanged (callers that
 * substring-match it keep working); `status` and the body's `errorCode` ride along.
 */
export class BffRequestError extends Error {
  /** HTTP status, or `null` when the call succeeded but the body was unusable. */
  readonly status: number | null;
  /** The body's `errorCode` (e.g. `USER_EXISTS`, `AUTO_LOGIN_FAILED`), or `null`. */
  readonly errorCode: string | null;

  constructor(message: string, status: number | null, errorCode: string | null) {
    super(message);
    this.name = 'BffRequestError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The `errorCode` (or `ErrorCode`) string of a response body, else `null`. */
export function readBffErrorCode(body: unknown): string | null {
  if (!isRecord(body)) {return null;}
  const code = body.errorCode ?? body.ErrorCode;
  return typeof code === 'string' && code !== '' ? code : null;
}

/** Type guard that also accepts a structurally identical error from another bundle copy. */
export function isBffRequestError(error: unknown): error is BffRequestError {
  if (error instanceof BffRequestError) {return true;}
  return error instanceof Error && error.name === 'BffRequestError' && 'status' in error && 'errorCode' in error;
}
