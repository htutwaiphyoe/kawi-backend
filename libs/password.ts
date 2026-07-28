export const hashPassword = (password: string): Promise<string> =>
  Bun.password.hash(password);

export const verifyPassword = (
  password: string,
  hash: string,
): Promise<boolean> => Bun.password.verify(password, hash);
