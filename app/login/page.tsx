import { Logo } from "@/components/Brand";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <>
      <div className="topbar">
        <Logo href="/login" />
      </div>
      <AuthForm mode="login" />
    </>
  );
}
