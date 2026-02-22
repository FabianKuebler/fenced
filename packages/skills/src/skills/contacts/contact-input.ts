import type { people_v1 } from 'googleapis';

export type ContactInput = {
  givenName?: string;
  familyName?: string;
  emails?: { value: string; type?: 'home' | 'work' | 'other' }[];
  phones?: { value: string; type?: 'home' | 'work' | 'mobile' | 'other' }[];
  organization?: { name?: string; title?: string };
  address?: {
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    type?: 'home' | 'work' | 'other';
  };
  birthday?: { year?: number; month: number; day: number };
  notes?: string;
};

export function contactInputToPerson(input: ContactInput): people_v1.Schema$Person {
  const person: people_v1.Schema$Person = {};

  if (input.givenName || input.familyName) {
    person.names = [{
      givenName: input.givenName,
      familyName: input.familyName,
    }];
  }

  if (input.emails?.length) {
    person.emailAddresses = input.emails.map((e) => ({
      value: e.value,
      type: e.type,
    }));
  }

  if (input.phones?.length) {
    person.phoneNumbers = input.phones.map((p) => ({
      value: p.value,
      type: p.type,
    }));
  }

  if (input.organization) {
    person.organizations = [{
      name: input.organization.name,
      title: input.organization.title,
    }];
  }

  if (input.address) {
    person.addresses = [{
      streetAddress: input.address.streetAddress,
      city: input.address.city,
      region: input.address.region,
      postalCode: input.address.postalCode,
      country: input.address.country,
      type: input.address.type,
    }];
  }

  if (input.birthday) {
    person.birthdays = [{
      date: {
        year: input.birthday.year,
        month: input.birthday.month,
        day: input.birthday.day,
      },
    }];
  }

  if (input.notes) {
    person.biographies = [{
      value: input.notes,
      contentType: 'TEXT_PLAIN',
    }];
  }

  return person;
}
