type ContactSummary = {
  resourceName: string;
  displayName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  organization?: string;
  photoUrl?: string;
};

declare function searchContacts(query: string): Promise<ContactSummary[]>;