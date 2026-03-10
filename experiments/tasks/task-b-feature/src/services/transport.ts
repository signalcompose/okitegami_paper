export interface TransportAdapter {
  send(recipient: string, payload: Record<string, unknown>): Promise<boolean>;
}

// TODO: Implement ConsoleTransport
// See TASK.md for specification
