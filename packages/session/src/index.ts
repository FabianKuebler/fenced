export type SessionInit = {
  id?: string;
};

/**
 * Minimal placeholder for future session logic.
 * Each WebSocket connection will receive its own Session instance.
 */
export class Session {
  readonly id: string;
  readonly createdAt: Date;

  constructor(init: SessionInit = {}) {
    this.id = init.id ?? crypto.randomUUID();
    this.createdAt = new Date();
  }
}
