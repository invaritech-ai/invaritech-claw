export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus = "complete" | "failed_partial";

export type ThreadRecord = {
  id: string;
  title: string;
  objective: string | null;
  activeModelRef: string;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type MessageRecord = {
  id: string;
  threadId: string;
  role: MessageRole;
  contentText: string;
  modelRef: string | null;
  status: MessageStatus;
  createdAtMs: number;
};

export type ThreadSummaryRecord = {
  id: string;
  threadId: string;
  summaryText: string;
  coveredThroughMessageId: string | null;
  sourceSummaryId: string | null;
  createdAtMs: number;
};

export type MemoryScope = "thread" | "global";

export type MemoryType =
  | "fact"
  | "preference"
  | "decision"
  | "constraint"
  | "principle"
  | "milestone";

export type MemoryStatus = "active" | "forgotten";

export type MemoryRecord = {
  id: string;
  scope: MemoryScope;
  threadId: string | null;
  type: MemoryType;
  contentText: string;
  tagsJson: string;
  importance: number;
  confidence: number;
  status: MemoryStatus;
  supersedesMemoryId: string | null;
  createdFromMessageId: string | null;
  updatedFromMessageId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type MemoryEventType = "created" | "updated" | "merged" | "rejected" | "forgotten";

export type MemoryEventRecord = {
  id: number;
  memoryId: string;
  eventType: MemoryEventType;
  payloadJson: string;
  createdAtMs: number;
};

export type ModelInvocationKind = "chat" | "compaction" | "memory";

export type ModelInvocationStatus = "running" | "succeeded" | "failed";

export type ModelInvocationRecord = {
  id: string;
  threadId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  modelRef: string;
  kind: ModelInvocationKind;
  status: ModelInvocationStatus;
  errorJson: string | null;
  createdAtMs: number;
  finishedAtMs: number | null;
};

export type ModelInvocationMemoryRecord = {
  invocationId: string;
  memoryId: string;
  rank: number;
  score: number | null;
};

export type BackgroundJobStatus = "pending" | "running" | "succeeded" | "failed";

export type BackgroundJobRecord = {
  id: string;
  type: string;
  status: BackgroundJobStatus;
  payloadJson: string;
  errorJson: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};
