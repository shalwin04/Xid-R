import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  FileText,
  MessageSquare,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/contexts/theme-context';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Server, label: 'Capacity', href: '/dashboard/capacity' },
  { icon: FileText, label: 'Leases', href: '/dashboard/leases' },
  { icon: MessageSquare, label: 'Explain', href: '/dashboard/explain' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function DashboardLayout({ children, title, subtitle, actions }: DashboardLayoutProps) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={cn("min-h-screen bg-background dashboard-theme", theme === 'dark' && 'dark')}>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 border-r border-border bg-card hidden lg:block">
        <div className="p-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-sm">X</span>
            </div>
            <span className="font-semibold text-foreground">Xid-R</span>
          </Link>
        </div>

        <nav className="px-3 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="absolute bottom-20 left-0 right-0 px-4">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-4 h-4" />
                Dark Mode
              </>
            ) : (
              <>
                <Sun className="w-4 h-4" />
                Light Mode
              </>
            )}
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <span className="text-sm font-medium text-foreground">A</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">Admin</div>
              <div className="text-xs text-muted-foreground">admin@xid-r.io</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-60">
        <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between px-6">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {/* Mobile theme toggle */}
            <button
              onClick={toggleTheme}
              className="lg:hidden h-9 w-9 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-foreground" />
              ) : (
                <Sun className="w-4 h-4 text-foreground" />
              )}
            </button>
            {actions}
          </div>
        </header>

        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default DashboardLayout;
