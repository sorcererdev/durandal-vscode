// errorMessage: an error's message as it came, for showing (the server's words, never reworded).
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
