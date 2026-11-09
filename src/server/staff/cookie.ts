// The staff session cookie's name and life, apart from the login code so the
// proxy can renew the cookie without loading the database or Argon2.

export const SESSION_COOKIE = "ff_admin";
export const SESSION_DAYS = 30;
