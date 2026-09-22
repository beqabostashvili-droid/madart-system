import { Injectable } from '@nestjs/common';

/** Injectable clock so tests can freeze/advance time. */
@Injectable()
export class Clock {
  private offsetMs = 0;
  private frozen: Date | null = null;

  now(): Date {
    return this.frozen ? new Date(this.frozen.getTime()) : new Date(Date.now() + this.offsetMs);
  }

  /** Test helper: pin the clock. */
  freeze(at: Date) {
    this.frozen = new Date(at.getTime());
  }

  /** Test helper: move the (frozen) clock forward. */
  advance(ms: number) {
    if (this.frozen) this.frozen = new Date(this.frozen.getTime() + ms);
    else this.offsetMs += ms;
  }

  reset() {
    this.frozen = null;
    this.offsetMs = 0;
  }
}
