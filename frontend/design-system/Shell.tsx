import Icon from "@/frontend/design-system/Icon";

export type NavItem = { href: string; label: string; icon: string; count?: number; active?: boolean; external?: boolean };

/**
 * Persistent shell: sidebar + header stay identical between pages (view-transition-name main-sidebar / main-header);
 * only {children} (main-content) cross-fades.
 */
export default function Shell({ section, nav, extra, userName, title, subtitle, bellHref, bellCount, search, children }: {
  section: string; nav: NavItem[]; extra?: NavItem[]; userName: string; title: string; subtitle: string; bellHref?: string; bellCount?: number;
  search?: { action: string; hidden: Record<string, string>; value?: string; placeholder?: string }; children: React.ReactNode;
}) {
  const initials = userName.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "A";
  const link = (n: NavItem) => (
    <a key={n.label} href={n.href} {...(n.external ? { target: "_blank", rel: "noreferrer" } : {})} className={`ds-nav ${n.active ? "ds-nav-active" : ""}`}>
      <Icon name={n.icon} size={20} />
      <span>{n.label}</span>
      {n.count !== undefined && <b className="ds-nav-count">{n.count}</b>}
    </a>
  );
  return (
    <div className="ds-root">
      <aside className="ds-sidebar" style={{ viewTransitionName: "main-sidebar" } as React.CSSProperties}>
        <div className="ds-sidebar-in">
          <div className="ds-brand"><span className="ds-logo">A</span><span>Aangan Studio</span></div>
          <div className="ds-who">
            <span className="ds-who-icon"><Icon name="user" size={20} /></span>
            <div><small>Signed in as</small><b>{userName}</b></div>
          </div>
          <p className="ds-label">{section}</p>
          <nav className="ds-navlist">{nav.map(link)}</nav>
          {extra && extra.length > 0 && (<><p className="ds-label">Shortcuts</p><nav className="ds-navlist">{extra.map(link)}</nav></>)}
        </div>
      </aside>

      <main className="ds-main">
        <header className="ds-header" style={{ viewTransitionName: "main-header" } as React.CSSProperties}>
          <div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="ds-header-right">
            {search && (
              <form action={search.action} method="get" className="ds-search">
                {Object.entries(search.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                <Icon name="search" size={16} />
                <input name="q" defaultValue={search.value ?? ""} placeholder={search.placeholder ?? "Search"} />
              </form>
            )}
            {bellHref && (
              <a href={bellHref} className="ds-bell" aria-label="Leads waiting for you"><Icon name="bell" size={20} />{!!bellCount && <i />}</a>
            )}
            <span className="ds-avatar" title={userName}>{initials}</span>
          </div>
        </header>
        <nav className="ds-mobile-nav">{nav.map(link)}</nav>
        <div className="ds-content" style={{ viewTransitionName: "main-content" } as React.CSSProperties}>{children}</div>
      </main>
    </div>
  );
}
