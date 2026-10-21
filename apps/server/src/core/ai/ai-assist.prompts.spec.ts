import { buildAiAssistPrompt } from './ai-assist.prompts';

describe('buildAiAssistPrompt', () => {
  it('asks for Markdown only and keeps the language of the text', () => {
    const { system } = buildAiAssistPrompt({ action: 'improve', text: 'x' });
    expect(system).toMatch(/Markdown/);
    expect(system).toMatch(/same language/);
  });

  it('includes the task and the text', () => {
    const { prompt } = buildAiAssistPrompt({
      action: 'fix_grammar',
      text: 'hôm nay',
    });
    expect(prompt).toMatch(/^Task: Fix spelling/);
    expect(prompt).toContain('"""\nhôm nay\n"""');
  });

  it('fills the language and tone', () => {
    expect(
      buildAiAssistPrompt({
        action: 'translate',
        text: 'x',
        language: 'Japanese',
      }).prompt,
    ).toContain('into Japanese');
    expect(
      buildAiAssistPrompt({ action: 'tone', text: 'x', tone: 'casual' }).prompt,
    ).toContain('casual tone');
  });

  it('uses the custom prompt and omits empty text', () => {
    const { prompt } = buildAiAssistPrompt({
      action: 'custom',
      text: '  ',
      prompt: ' Write a haiku ',
    });
    expect(prompt).toBe('Task: Write a haiku');
  });
});
