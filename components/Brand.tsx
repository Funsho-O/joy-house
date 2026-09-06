export function ColourStrip() {
  return <div className="colour-strip" aria-hidden="true" />;
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <a className="logo" href={href}>
      <img className="logo-img" src="/logo.png" alt="Joy House logo" />
      <div className="logo-text">
        <span className="logo-joy">Joy</span>
        <span className="logo-house">HOUSE</span>
      </div>
    </a>
  );
}
