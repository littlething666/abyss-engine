import { QueryClient } from '@tanstack/react-query';

/**
 * Runtime source of truth for pub/sub event types.
 * `eventNamePattern.test.ts` asserts every name matches the canonical
 * `domain:event` regex.
 */
export const PUB_SUB_EVENT_TYPES = [
  'topic:updated',
  'topic-cards:updated',
  'subject:updated',
  'subject-graph:published',
  'crystal-trial:updated',
] as const;

export type PubSubEventType = (typeof PUB_SUB_EVENT_TYPES)[number];

export interface PubSubMessage {
  type: PubSubEventType;
  subjectId?: string;
  topicId?: string;
  payload?: unknown;
}

type PubSubHandler = (message: PubSubMessage) => void;

export class PubSubClient {
  private handlers = new Map<PubSubEventType, Set<PubSubHandler>>();
  private queryClient?: QueryClient;

  on(type: PubSubEventType, handler: PubSubHandler): void {
    const bucket = this.handlers.get(type) ?? new Set();
    bucket.add(handler);
    this.handlers.set(type, bucket);
  }

  off(type: PubSubEventType, handler: PubSubHandler): void {
    const bucket = this.handlers.get(type);
    if (!bucket) {
      return;
    }
    bucket.delete(handler);
    if (!bucket.size) {
      this.handlers.delete(type);
    }
  }

  connect() {
    return {
      close: () => this.disconnect(),
    };
  }

  disconnect() {
    this.handlers.clear();
  }

  bindQueryClient(queryClient: QueryClient): void {
    this.queryClient = queryClient;
  }

  publishBackendSubjectGraph(subjectId: string): void {
    if (!subjectId.trim()) {
      throw new Error('[PubSubClient] subject graph publication requires subjectId');
    }
    this.emit({ type: 'subject-graph:published', subjectId });
  }

  publishTopicContent(subjectId: string, topicId: string): void {
    if (!subjectId.trim() || !topicId.trim()) {
      throw new Error('[PubSubClient] topic content publication requires subjectId and topicId');
    }
    this.emit({ type: 'topic:updated', subjectId, topicId });
    this.emit({ type: 'topic-cards:updated', subjectId, topicId });
  }

  publishTopicCards(subjectId: string, topicId: string): void {
    if (!subjectId.trim() || !topicId.trim()) {
      throw new Error('[PubSubClient] topic cards publication requires subjectId and topicId');
    }
    this.emit({ type: 'topic-cards:updated', subjectId, topicId });
  }

  publishCrystalTrial(subjectId: string, topicId: string): void {
    if (!subjectId.trim() || !topicId.trim()) {
      throw new Error('[PubSubClient] crystal trial publication requires subjectId and topicId');
    }
    this.emit({ type: 'crystal-trial:updated', subjectId, topicId });
  }

  emit(message: PubSubMessage): void {
    const bucket = this.handlers.get(message.type);
    if (bucket) {
      for (const handler of bucket) {
        handler(message);
      }
    }

    this.invalidateQueries(message);
  }

  private invalidateQueries(message: PubSubMessage): void {
    if (!this.queryClient) {
      return;
    }

    switch (message.type) {
      case 'topic:updated': {
        const subjectId = message.subjectId ?? '';
        const topicId = message.topicId ?? '';
        if (subjectId && topicId) {
          this.queryClient.invalidateQueries({ queryKey: ['content', 'topic', subjectId, topicId] });
          this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-statuses', subjectId] });
          this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-ready', subjectId, topicId] });
        } else if (subjectId) {
          this.queryClient.invalidateQueries({ queryKey: ['content', 'subject', subjectId, 'graph'] });
        }
        return;
      }
      case 'topic-cards:updated': {
        const subjectId = message.subjectId ?? '';
        const topicId = message.topicId ?? '';
        if (subjectId && topicId) {
          this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-cards', subjectId, topicId] });
          this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-statuses', subjectId] });
          this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-ready', subjectId, topicId] });
        } else if (subjectId) {
          this.queryClient.invalidateQueries({ queryKey: ['content', 'subject', subjectId, 'graph'] });
        }
        return;
      }
      case 'subject:updated': {
        if (message.subjectId) {
          this.queryClient.invalidateQueries({ queryKey: ['content', 'subject', message.subjectId, 'graph'] });
          this.queryClient.invalidateQueries({ queryKey: ['content', 'subject', 'graphs'] });
        } else {
          this.queryClient.invalidateQueries({ queryKey: ['content', 'subject'] });
        }
        this.queryClient.invalidateQueries({ queryKey: ['content', 'subjects'] });
        return;
      }
      case 'subject-graph:published': {
        const subjectId = message.subjectId ?? '';
        if (!subjectId) return;
        this.queryClient.invalidateQueries({ queryKey: ['content', 'subjects'] });
        this.queryClient.invalidateQueries({ queryKey: ['content', 'subject', subjectId, 'graph'] });
        this.queryClient.invalidateQueries({ queryKey: ['content', 'subject', 'graphs'] });
        this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-statuses', subjectId] });
        return;
      }
      case 'crystal-trial:updated': {
        const subjectId = message.subjectId ?? '';
        const topicId = message.topicId ?? '';
        if (!subjectId || !topicId) return;
        this.queryClient.invalidateQueries({ queryKey: ['content', 'crystal-trial', subjectId, topicId] });
        this.queryClient.invalidateQueries({ queryKey: ['content', 'topic-statuses', subjectId] });
        return;
      }
      default:
        return;
    }
  }
}

export const pubSubClient = new PubSubClient();

