import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ClipboardList, AlertTriangle } from "lucide-react";

// audit_logs table removed - show placeholder
export default function AuditLog() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: isManager } = useQuery({
    queryKey: ["is-manager", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "manager")
        .single();
      return !!data;
    },
    enabled: !!user?.id,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (isManager === false) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Audit Log
            </h1>
            <p className="text-xs text-muted-foreground">Track all system changes</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Audit Log Unavailable</h3>
            <p className="text-muted-foreground mt-2">
              The audit log feature is currently being restructured.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
