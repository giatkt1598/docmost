export interface IAiChat {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IChatToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  ok?: boolean;
  // page edits: what Undo needs
  editId?: string;
}

// what the user selected on the page, sent with a message
export interface IChatSelection {
  text: string;
  blockIds: string[];
}

export interface IChatMessage {
  // undefined while the reply is still streaming
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: IChatToolCall[] | null;
  error?: string | null;
}

export type ChatStreamEvent =
  | { type: "chat"; chat: IAiChat }
  | { type: "text"; text: string }
  | { type: "tool-call"; id: string; name: string; input: any }
  | {
      type: "tool-result";
      id: string;
      name: string;
      ok: boolean;
      editId?: string;
    }
  | { type: "error"; message: string }
  | { type: "done"; messageId: string };
