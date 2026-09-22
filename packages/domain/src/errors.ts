export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
  ) {
    super('INVALID_TRANSITION', `${entity}: cannot transition from ${from} to ${to}`);
  }
}

/** Raised when a conditional update touched 0 rows – someone else moved first. */
export class ConflictError extends DomainError {
  constructor(message = 'The resource was modified concurrently') {
    super('CONFLICT', message);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION', message);
  }
}
