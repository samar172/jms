"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, Search, Bell, LogOut, Moon, Sun, Gem, Users as UsersIcon, TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useKarigars } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApi } from "@/lib/hooks";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ProductHit {
  serialNo: string;
  designName: string;
}
interface WastageAlert {
  wastageRecordId: string;
  karigarName: string;
  serialNo: string;
  wastagePct: string;
}

export function Topbar({ title, onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const { data: karigars } = useKarigars();
  const { data: alerts } = useApi<WastageAlert[]>("/api/dashboard/wastage-alerts");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setProductHits([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ items: ProductHit[] }>(
          `/api/products?search=${encodeURIComponent(query.trim())}&pageSize=5`
        );
        setProductHits(res.items ?? []);
      } catch {
        setProductHits([]);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const karigarHits = query.trim()
    ? (karigars ?? []).filter((k) => k.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
    : [];

  const hasResults = productHits.length > 0 || karigarHits.length > 0;
  const showDropdown = searchFocused && query.trim().length > 0 && hasResults;

  function goTo(href: string) {
    setSearchFocused(false);
    setQuery("");
    router.push(href);
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-3 backdrop-blur-sm sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground md:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        {title && <h1 className="hidden text-base font-semibold sm:block">{title}</h1>}
        <div ref={searchBoxRef} className="relative max-w-sm flex-1 sm:ml-4">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search products, karigars…"
            value={query}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                goTo(`/products?search=${encodeURIComponent(query.trim())}`);
              }
            }}
          />
          {showDropdown && (
            <div className="absolute top-full left-0 z-50 mt-1 w-80 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
              {productHits.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Products
                  </div>
                  {productHits.map((p) => (
                    <button
                      key={p.serialNo}
                      onClick={() => goTo(`/products/${p.serialNo}`)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Gem className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        <span className="font-mono text-primary">{p.serialNo}</span> — {p.designName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {karigarHits.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Karigars
                  </div>
                  {karigarHits.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => goTo(`/karigars/${k.id}`)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <UsersIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{k.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Popover>
          <PopoverTrigger
            aria-label="Notifications"
            className={cn(
              "relative hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            )}
          >
            <Bell size={18} />
            {alerts && alerts.length > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-destructive" />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b px-3 py-2 text-sm font-semibold">Wastage Alerts</div>
            <div className="max-h-80 overflow-y-auto p-1">
              {alerts && alerts.length > 0 ? (
                alerts.map((a) => (
                  <Link
                    key={a.wastageRecordId}
                    href="/job-cards"
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                  >
                    <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1 truncate">
                      {a.karigarName} — <span className="font-mono">{a.serialNo}</span>
                    </span>
                    <Badge variant="destructive">{formatPct(a.wastagePct)}</Badge>
                  </Link>
                ))
              ) : (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">No open wastage exceptions.</p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent">
              <Avatar size="sm">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left text-sm sm:block">
                <div className="leading-tight font-medium">{user.name}</div>
                <div className="text-xs leading-tight text-muted-foreground">{user.role.replace(/_/g, " ")}</div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
