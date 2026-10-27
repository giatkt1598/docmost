import { z } from 'zod';

// A tool offered the same way over MCP and in AI chat: one schema, one
// description, one handler. Write tools are left out in read-only chats.
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  readOnly: boolean;
  run: (args: any) => Promise<unknown>;
};
