import { isTestSkillsMode, isGoogleSkillsDisabled } from './test-mode';

export type RuntimeSkills = Record<string, unknown>;

let cachedSkills: RuntimeSkills | undefined;

export async function loadRuntimeSkills(): Promise<RuntimeSkills> {
  if (cachedSkills) {
    return cachedSkills;
  }

  if (isTestSkillsMode()) {
    const testSkill = await import('./skills/test-skill/index.ts');
    cachedSkills = { test: testSkill };
    return cachedSkills;
  }

  if (isGoogleSkillsDisabled()) {
    cachedSkills = {};
    return cachedSkills;
  }

  const [mail, contacts, calendar] = await Promise.all([
    import('./skills/mail/index.ts'),
    import('./skills/contacts/index.ts'),
    import('./skills/calendar/index.ts'),
  ]);

  cachedSkills = { ...mail, ...contacts, ...calendar };
  return cachedSkills;
}
