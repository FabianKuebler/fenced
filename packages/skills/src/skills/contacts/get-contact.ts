import { getPeople } from './people';
import { personToSummary, PERSON_FIELDS, type ContactSummary } from './list-contacts';

export async function getContact(resourceName: string): Promise<ContactSummary | null> {
  try {
    const people = await getPeople();
    const res = await people.people.get({
      resourceName,
      personFields: PERSON_FIELDS,
    });

    if (!res.data) return null;
    return personToSummary(res.data);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 404) {
      return null;
    }
    throw err;
  }
}
