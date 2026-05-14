import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TopBarProps {
  placeholder?: string;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  searchValue?: string;
  onSearch?: (q: string) => void;
  children?: React.ReactNode;
}

export default function TopBar({
  placeholder = "Search…",
  title,
  actionLabel,
  onAction,
  searchValue,
  onSearch,
  children,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="search-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          placeholder={placeholder}
          value={searchValue ?? ""}
          onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
          readOnly={!onSearch}
        />
      </div>

      {title ? (
        <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginLeft: 8, flex: 1, letterSpacing: "-.02em", whiteSpace: "nowrap" }}>
          {title}
        </h1>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {children && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {children}
        </div>
      )}

      {actionLabel && (
        <Button
          variant="lime"
          size="sm"
          onClick={onAction}
          className="rounded-full gap-1.5 font-bold text-xs h-[34px] px-3.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {actionLabel}
        </Button>
      )}

      <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-muted-foreground hover:text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </Button>

      <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-muted-foreground hover:text-white relative">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, background: "var(--coral)", borderRadius: "50%", border: "2px solid #16181A" }} />
      </Button>

      <Avatar style={{ width: 34, height: 34, cursor: "pointer" }}>
        <AvatarFallback style={{ background: "#252829", color: "#9CA3AF", fontSize: 12, fontWeight: 800 }}>
          SJ
        </AvatarFallback>
      </Avatar>
    </header>
  );
}
