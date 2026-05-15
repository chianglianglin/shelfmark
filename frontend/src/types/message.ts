// ─── Agent Names ──────────────────────────────────────────────────────────────
export type AgentName =
  | 'parser' | 'ocr' | 'layout' | 'selection' | 'renderer'
  | 'qa_parse' | 'qa_ocr' | 'qa_layout' | 'qa_selection'
  | 'orchestrator' | 'error_logger';

// ─── Error Codes ──────────────────────────────────────────────────────────────
export type ErrorCode =
  | 'BBOX_DRIFT'
  | 'STAIRCASE'
  | 'ZERO_WIDTH'
  | 'OCR_LOW_CONF'
  | 'ORDER_JUMP'
  | 'SELECT_MISS'
  | 'CORRUPT_PDF'
  | 'NO_GLYPHS';

export type ErrorSeverity = 'warn' | 'error' | 'fatal';

export interface AgentError {
  code: ErrorCode;
  severity: ErrorSeverity;
  affected: string[];
  detail: string;
  suggested_fix: string;
}

export interface AgentMessage<T = unknown> {
  msg_id: string;
  trace_id: string;
  from_agent: AgentName;
  to_agent: AgentName;
  status: 'success' | 'fail' | 'retry';
  attempt: number;
  payload: T;
  errors: AgentError[];
  timestamp: string;
}

let _counter = 0;
function generateId(): string {
  return `msg_${Date.now()}_${++_counter}`;
}

export function createMessage<T>(
  from: AgentName,
  to: AgentName,
  status: AgentMessage['status'],
  payload: T,
  errors: AgentError[] = [],
  trace_id?: string,
  attempt = 1,
): AgentMessage<T> {
  return {
    msg_id: generateId(),
    trace_id: trace_id ?? `trace_${Date.now()}`,
    from_agent: from,
    to_agent: to,
    status,
    attempt,
    payload,
    errors,
    timestamp: new Date().toISOString(),
  };
}

export function retryMessage<T>(msg: AgentMessage<T>): AgentMessage<T> {
  return { ...msg, msg_id: generateId(), status: 'retry', attempt: msg.attempt + 1 };
}
