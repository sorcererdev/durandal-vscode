import { errorMessage } from '../errors';

// acted: a key's action, a throw or a rejection told as the footer's notice (never silent)
export async function acted(act: () => Promise<true | string> | true | string, key: string): Promise<true | string> {
  try {
    return await act();
  } catch (e) {
    return `${key}: ${errorMessage(e)}`;
  }
}
