// Account rules shared by server code and tests (no auth SDK imports here).
export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "sahilkarande0918@gmail.com").toLowerCase();
export const FREE_GENERATIONS = 3;

export type User = { id: string; email: string; name: string; owner: boolean };

/** Owner rights need the owner's address AND a verified email, or anyone could sign up with it. */
export const isOwnerAccount = (email: string, verified: boolean) => verified && email.trim().toLowerCase() === OWNER_EMAIL;
