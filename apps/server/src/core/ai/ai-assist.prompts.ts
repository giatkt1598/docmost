// Prompts for "Ask AI" in the editor. The model gets the selected text as
// Markdown and must answer with Markdown only, so the result can be inserted
// into the page as is.

export const AI_ASSIST_ACTIONS = [
  'improve',
  'fix_grammar',
  'shorter',
  'longer',
  'simplify',
  'summarize',
  'continue',
  'translate',
  'tone',
  'custom',
] as const;
export type AiAssistAction = (typeof AI_ASSIST_ACTIONS)[number];

export const AI_ASSIST_TONES = [
  'professional',
  'casual',
  'friendly',
  'confident',
  'straightforward',
] as const;

const SYSTEM = [
  'You are a writing assistant inside the page editor of a team workspace.',
  'Answer with the resulting text only, formatted as Markdown.',
  'Do not add explanations, preambles, quotes around the result or code fences unless the text itself needs them.',
  'Keep links, lists, headings and other formatting unless asked to change them.',
  'Unless the task says otherwise, answer in the same language as the given text.',
].join(' ');

const TASKS: Record<Exclude<AiAssistAction, 'custom'>, string> = {
  improve:
    'Improve the writing of the text: clearer, more fluent and well structured, keeping its meaning.',
  fix_grammar:
    'Fix spelling, grammar and punctuation mistakes in the text. Change nothing else.',
  shorter: 'Make the text shorter and more concise, keeping the key points.',
  longer:
    'Make the text longer by expanding on its ideas with relevant detail. Do not invent facts.',
  simplify: 'Rewrite the text in simpler words that are easy to understand.',
  summarize: 'Summarize the text in a few sentences or bullet points.',
  continue:
    'Continue writing after the text, in the same style and language. Answer with the continuation only, without repeating the text.',
  translate: 'Translate the text into {{language}}.',
  tone: 'Rewrite the text in a {{tone}} tone, keeping its meaning.',
};

export function buildAiAssistPrompt(opts: {
  action: AiAssistAction;
  text: string;
  prompt?: string;
  language?: string;
  tone?: string;
}): { system: string; prompt: string } {
  const task =
    opts.action === 'custom'
      ? opts.prompt?.trim()
      : TASKS[opts.action]
          .replace('{{language}}', opts.language?.trim() || 'English')
          .replace('{{tone}}', opts.tone || 'professional');

  const parts = [`Task: ${task}`];
  if (opts.text.trim()) {
    parts.push(`Text:\n"""\n${opts.text}\n"""`);
  }
  return { system: SYSTEM, prompt: parts.join('\n\n') };
}
