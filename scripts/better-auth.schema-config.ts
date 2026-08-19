import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

// Schema-only configuration used by the official Better Auth CLI. Runtime
// configuration lives in lib/auth.ts where the Cloudflare D1 binding exists.
export const auth = betterAuth({
  plugins: [
    magicLink({
      sendMagicLink: async () => undefined,
      expiresIn: 600,
      storeToken: "hashed",
    }),
  ],
});
