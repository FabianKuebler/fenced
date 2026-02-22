import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTestSkillsMode, isGoogleSkillsDisabled } from './test-mode';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, 'skills');
const SKILL_DOC = 'SKILL.md';
const SKILL_ENTRY = 'index.d.ts';
const TEST_SKILL_NAME = 'test-skill';
const GOOGLE_SKILL_NAMES = new Set(['mail', 'contacts', 'calendar']);

export type SkillData = {
  name: string;
  doc: string;
  types: string;
};

async function safeReadFile(path: string): Promise<string> {
  try {
    const content = await readFile(path, 'utf8');
    return content.trim();
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return '';
    }
    throw error;
  }
}

export async function readSkillsData(): Promise<SkillData[]> {
  const entries = await listSkillDirectories();
  const selected = selectSkillEntries(entries);
  const skills: SkillData[] = [];

  for (const entry of selected) {
    const skillDir = resolve(SKILLS_DIR, entry.name);
    const doc = await safeReadFile(join(skillDir, SKILL_DOC));
    const types = await safeReadFile(join(skillDir, SKILL_ENTRY));

    if (!doc && !types) {
      continue;
    }

    skills.push({ name: entry.name, doc, types });
  }

  return skills;
}

async function listSkillDirectories() {
  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function selectSkillEntries(entries: Array<{ name: string }>) {
  if (isTestSkillsMode()) {
    const filtered = entries.filter((entry) => entry.name === TEST_SKILL_NAME);
    if (filtered.length === 0) {
      throw new Error(`Missing required ${TEST_SKILL_NAME} skill for test mode.`);
    }
    return filtered;
  }
  if (isGoogleSkillsDisabled()) {
    return entries.filter((entry) => entry.name !== TEST_SKILL_NAME && !GOOGLE_SKILL_NAMES.has(entry.name));
  }
  return entries.filter((entry) => entry.name !== TEST_SKILL_NAME);
}
