import { getPeople } from './people';
import { personToSummary, PERSON_FIELDS, type ContactSummary } from './list-contacts';
import { contactInputToPerson, type ContactInput } from './contact-input';

export async function updateContact(resourceName: string, contact: ContactInput): Promise<ContactSummary> {
  const people = await getPeople();
  // First, get the current contact to retrieve the etag
  const current = await people.people.get({
    resourceName,
    personFields: PERSON_FIELDS,
  });

  const person = contactInputToPerson(contact);
  person.etag = current.data.etag;

  // Build updatePersonFields based on what's being updated
  const updateFields: string[] = [];
  if (contact.givenName !== undefined || contact.familyName !== undefined) updateFields.push('names');
  if (contact.emails !== undefined) updateFields.push('emailAddresses');
  if (contact.phones !== undefined) updateFields.push('phoneNumbers');
  if (contact.organization !== undefined) updateFields.push('organizations');
  if (contact.address !== undefined) updateFields.push('addresses');
  if (contact.birthday !== undefined) updateFields.push('birthdays');
  if (contact.notes !== undefined) updateFields.push('biographies');

  const res = await people.people.updateContact({
    resourceName,
    updatePersonFields: updateFields.join(','),
    personFields: PERSON_FIELDS,
    requestBody: person,
  });

  return personToSummary(res.data);
}
