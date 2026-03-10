import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
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
        (token as any).userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).id = (token as any).userId;
      return session;
    },
  },
  pages: { signIn: "/" },
});
