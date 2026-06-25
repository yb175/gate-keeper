"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, MessageSquare, Key, CheckCircle, Terminal } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Chat", href: "/chat", icon: MessageSquare },
    { name: "Policies", href: "/policies", icon: Key },
    { name: "Approvals", href: "/approvals", icon: CheckCircle },
    { name: "Logs", href: "/logs", icon: Terminal },
  ];

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-white" />
            <span className="font-mono font-bold tracking-tight text-white text-sm">GATEKEEPER</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex space-x-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-sm font-mono text-xs transition-colors duration-150 ${
                    isActive
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
