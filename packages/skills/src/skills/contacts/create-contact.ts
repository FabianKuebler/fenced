import { getPeople } from './people';
import { personToSummary, PERSON_FIELDS, type ContactSummary } from './list-contacts';
import { contactInputToPerson, type ContactInput } from './contact-input';

export async function createContact(contact: ContactInput): Promise<ContactSummary> {
  const people = await getPeople();
  const person = contactInputToPerson(contact);

  const res = await people.people.createContact({
    requestBody: person,
    personFields: PERSON_FIELDS,
  });

  return personToSummary(res.data);
}
