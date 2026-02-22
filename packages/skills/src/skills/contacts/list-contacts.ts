import { getPeople } from './people';

export type ContactSummary = {
  resourceName: string;
  displayName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  organization?: string;
  photoUrl?: string;
};

export type ListContactsParams = {
  pageSize?: number;
  pageToken?: string;
  sortOrder?: 'LAST_MODIFIED_ASCENDING' | 'LAST_MODIFIED_DESCENDING' | 'FIRST_NAME_ASCENDING' | 'LAST_NAME_ASCENDING';
};

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos';

export function personToSummary(person: {
  resourceName?: string | null;
  names?: { displayName?: string | null }[] | null;
  emailAddresses?: { value?: string | null }[] | null;
  phoneNumbers?: { value?: string | null }[] | null;
  organizations?: { name?: string | null }[] | null;
  photos?: { url?: string | null }[] | null;
}): ContactSummary {
  return {
    resourceName: person.resourceName ?? '',
    displayName: person.names?.[0]?.displayName ?? '',
    primaryEmail: person.emailAddresses?.[0]?.value ?? undefined,
    primaryPhone: person.phoneNumbers?.[0]?.value ?? undefined,
    organization: person.organizations?.[0]?.name ?? undefined,
    photoUrl: person.photos?.[0]?.url ?? undefined,
  };
}

export type ListContactsResult = {
  contacts: ContactSummary[];
  nextPageToken?: string;
};

export async function listContacts(params?: ListContactsParams): Promise<ListContactsResult> {
  const people = await getPeople();
  const res = await people.people.connections.list({
    resourceName: 'people/me',
    pageSize: params?.pageSize ?? 10,
    pageToken: params?.pageToken,
    sortOrder: params?.sortOrder,
    personFields: PERSON_FIELDS,
  });

  const connections = res.data.connections ?? [];
  return {
    contacts: connections.map(personToSummary),
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
}

export { PERSON_FIELDS };
