export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`EPG upstream responded ${status}: ${detail}`);
    this.name = 'UpstreamError';
  }
}

export class UpstreamPayloadError extends Error {
  constructor(
    readonly detail: string,
    options?: { cause?: unknown },
  ) {
    super(`Invalid EPG payload: ${detail}`, options);
    this.name = 'UpstreamPayloadError';
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(
    readonly detail: string,
    options?: { cause?: unknown },
  ) {
    super(`EPG upstream is unreachable: ${detail}`, options);
    this.name = 'UpstreamUnavailableError';
  }
}
