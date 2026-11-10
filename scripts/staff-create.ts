// Creates a staff account and prints the code to add to an authenticator app.
// Usage: pnpm staff:create <email>   (the password is read from STAFF_PASSWORD
// or typed in, never passed on the command line where shell history keeps it)
import { createInterface } from "node:readline/promises";
import { closePool } from "../src/core/platform/db";
import { hashPassword, newTotpSecret, saveStaff } from "../src/core/platform/staff/auth";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("Usage: pnpm staff:create <email>");
  let password = process.env.STAFF_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (at least 12 characters): ");
    rl.close();
  }
  if (password.length < 12) throw new Error("The password must have at least 12 characters");
  const totp = newTotpSecret(email);
  await saveStaff(email, await hashPassword(password), totp.secret);
  console.log(`Staff account ready: ${email}`);
  console.log("Add this to an authenticator app (scan as a link or type the key):");
  console.log(`  key: ${totp.secret}`);
  console.log(`  link: ${totp.uri}`);
}

main()
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
