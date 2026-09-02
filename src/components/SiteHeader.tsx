import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpenText, MessageSquare, PlusCircle, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const { user, loading } = useAuth();
  const { isAdmin } = useRoles();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
          <BookOpenText className="h-5 w-5 text-accent" aria-hidden="true" />
          NoteSwap
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/browse">Browse</Link>
          </Button>
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/messages">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Chats
                </Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Admin
                  </Link>
                </Button>
              )}
              <Button asChild size="sm">
                <Link to="/sell">
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                  Post notes
                </Link>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                aria-label="Sign out"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            !loading && (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
