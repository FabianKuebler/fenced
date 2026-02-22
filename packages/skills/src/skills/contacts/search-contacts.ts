import { getPeople } from './people';
import { personToSummary, PERSON_FIELDS, type ContactSummary } from './list-contacts';

export async function searchContacts(query: string): Promise<ContactSummary[]> {
  const people = await getPeople();
  const res = await people.people.searchContacts({
    query: query,
    pageSize: 10,
    readMask: PERSON_FIELDS,
  });

  const results = res.data.results ?? [];
  return results
    .map((r) => r.person)
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(personToSummary);
}
