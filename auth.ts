import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
      authorization: {
        params: {
          scope: "openid profile email User.Read Calendars.Read",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist access token from the OAuth provider on initial sign-in
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      if (token.email) {
        const user = await prisma.user.upsert({
          where: { email: token.email.toLowerCase() },
          update: {
            displayName: typeof token.name === "string" && token.name ? token.name : token.email,
            entraObjectId: typeof profile?.sub === "string" ? profile.sub : undefined,
            active: true,
          },
          create: {
            email: token.email.toLowerCase(),
            displayName: typeof token.name === "string" && token.name ? token.name : token.email,
            entraObjectId: typeof profile?.sub === "string" ? profile.sub : null,
            active: true,
          },
        });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) session.user.id = token.userId;
      if (token.accessToken) {
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: { signIn: "/" },
});
