import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Gem,
  Camera,
  ClipboardList,
  Boxes,
  Calculator,
  BookOpen,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import type { Role } from "@jms/shared";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Omit = visible to every role. */
  roles?: Role[];
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

export const NAV_CONFIG: NavSection[] = [
  {
    section: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Catalogue",
    items: [
      { title: "Products", href: "/products", icon: Gem },
      { title: "Visual Search", href: "/visual-search", icon: Camera },
    ],
  },
  {
    section: "Production",
    items: [
      { title: "Job Cards", href: "/job-cards", icon: ClipboardList },
      {
        title: "Materials & Stock",
        href: "/materials",
        icon: Boxes,
        roles: ["SUPER_ADMIN", "MANAGER", "STORE", "COSTING", "AUDITOR"],
      },
    ],
  },
  {
    section: "Finance",
    items: [
      {
        title: "Costing",
        href: "/costing",
        icon: Calculator,
        roles: ["SUPER_ADMIN", "MANAGER", "COSTING", "AUDITOR"],
      },
      {
        title: "Ledger",
        href: "/ledger",
        icon: BookOpen,
        roles: ["SUPER_ADMIN", "MANAGER", "COSTING", "SALES", "AUDITOR"],
      },
    ],
  },
  {
    section: "People",
    items: [{ title: "Karigars", href: "/karigars", icon: Users }],
  },
  {
    section: "Reports",
    items: [{ title: "Reports", href: "/reports", icon: BarChart3 }],
  },
  {
    section: "Settings",
    items: [{ title: "Settings", href: "/settings", icon: Settings, roles: ["SUPER_ADMIN"] }],
  },
];
