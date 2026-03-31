import type { SseEnvelope } from './types';

export type Subscriber = {
  id: string;
  send: (msg: SseEnvelope) => void;
  close: () => void;
  filter: (msg: SseEnvelope) => boolean;
};

export class InMemoryEventBus {
  private subscribers = new Map<string, Subscriber>();

  subscribe(sub: Subscriber) {
    this.subscribers.set(sub.id, sub);
    return () => {
      this.subscribers.delete(sub.id);
      sub.close();
    };
  }

  publish(msg: SseEnvelope) {
    for (const sub of this.subscribers.values()) {
      if (sub.filter(msg)) sub.send(msg);
    }
  }
}
