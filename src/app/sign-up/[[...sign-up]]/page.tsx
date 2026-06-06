import { SignUp } from "@clerk/nextjs";

/**
 * Clerk sign-up page for SSO-enabled deployments.
 *
 * @returns Sign-up UI.
 */
export default function SignUpPage(): React.ReactElement {
  return (
    <main style={{ display: "flex", justifyContent: "center", padding: "3rem 1rem" }}>
      <SignUp />
    </main>
  );
}
