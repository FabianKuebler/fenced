const TEST_FLAG =
  process.env.FENCED_TEST_SKILLS === '1' ||
  process.env.NODE_ENV === 'test' ||
  process.env.BUN_TESTING === '1';

const GOOGLE_DISABLED =
  process.env.FENCED_DISABLE_GOOGLE_SKILLS === '1' ||
  process.env.FENCED_DISABLE_GOOGLE_SKILLS === 'true';

export function isTestSkillsMode(): boolean {
  return TEST_FLAG;
}

export function isGoogleSkillsDisabled(): boolean {
  return GOOGLE_DISABLED;
}
