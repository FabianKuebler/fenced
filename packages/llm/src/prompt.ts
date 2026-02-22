import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPT_FILE = resolve(__dirname, './PROMPT.yaml');

export type PromptMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type SkillData = {
  name: string;
  doc: string;
  types: string;
};

export type PromptContext = {
  skills: SkillData[];
};

type PromptYaml = {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
};

export async function loadConversation(context: PromptContext): Promise<PromptMessage[]> {
  const raw = await readFile(PROMPT_FILE, 'utf8');
  const yaml = parseYaml(raw) as PromptYaml;

  if (!yaml.messages || !Array.isArray(yaml.messages)) {
    throw new Error('PROMPT.yaml must have a "messages" array');
  }

  return yaml.messages.map((msg) => ({
    role: msg.role,
    content: compileTemplate(msg.content, context),
  }));
}

function compileTemplate(template: string, context: PromptContext): string {
  const compiled = Handlebars.compile(template, { noEscape: true });
  return compiled(context).trim();
}
