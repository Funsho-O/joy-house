import { Logo } from "@/components/Brand";

export default function NotFound() {
  return (
    <>
      <div className="topbar">
        <Logo />
      </div>
      <div className="empty-state">
        That page is not here. <a href="/" style={{ color: "var(--blue)" }}>Back to the feed</a>
      </div>
    </>
  );
}
