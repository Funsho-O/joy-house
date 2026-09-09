import { Logo } from "@/components/Brand";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deactivated?: string }>;
}) {
  const query = await searchParams;
  return (
    <>
      <div className="topbar">
        <Logo href="/login" />
      </div>
      <AuthForm
        mode="login"
        notice={
          query.deactivated
            ? "This account has been deactivated. Posts and comments stay on the feed as Former Member."
            : undefined
        }
      />
    </>
  );
}
