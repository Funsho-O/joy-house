import { Logo } from "@/components/Brand";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <>
      <div className="topbar">
        <Logo href="/signup" />
      </div>
      <AuthForm mode="signup" />
    </>
  );
}
