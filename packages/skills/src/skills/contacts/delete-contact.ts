import { getPeople } from './people';

export async function deleteContact(resourceName: string): Promise<boolean> {
  try {
    const people = await getPeople();
    await people.people.deleteContact({
      resourceName,
    });
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 404) {
      return false;
    }
    throw err;
  }
}
