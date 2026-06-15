import type {
  MemoryEventRecord,
  MemoryEventType,
  MemoryRecord,
  MemoryScope,
  MemoryStatus,
  MemoryType,
  MessageRecord,
  MessageRole,
  MessageStatus,
  ModelInvocationKind,
  ModelInvocationMemoryRecord,
  ModelInvocationRecord,
  ModelInvocationStatus,
  ThreadRecord,
  ThreadSummaryRecord,
} from "../storage/schema.js";

export type Thread = ThreadRecord;
export type ThreadMessage = MessageRecord;
export type ThreadSummary = ThreadSummaryRecord;
export type ThreadMemory = MemoryRecord;
export type ThreadMemoryEvent = MemoryEventRecord;
export type ThreadModelInvocation = ModelInvocationRecord;
export type ThreadModelInvocationMemory = ModelInvocationMemoryRecord;

export type {
  MemoryEventType,
  MemoryScope,
  MemoryStatus,
  MemoryType,
  MessageRole,
  MessageStatus,
  ModelInvocationKind,
  ModelInvocationStatus,
};

export type ThreadContext = {
  thread: Thread;
  messages: ThreadMessage[];
  summary: ThreadSummary | undefined;
  memories: ThreadMemory[];
};

export type MemorySearchScope = "thread" | "global" | "thread_and_global";

export type MemorySearchInput = {
  query: string;
  scope: MemorySearchScope;
  threadId?: string;
  limit?: number;
};
