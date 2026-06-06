import { SignIn } from "@clerk/nextjs";

/**
 * Clerk sign-in page for SSO-enabled deployments.
 *
 * @returns Sign-in UI.
 */
export default function SignInPage(): React.ReactElement {
  return (
    <main style={{ display: "flex", justifyContent: "center", padding: "3rem 1rem" }}>
      <SignIn />
    </main>
  );
}
