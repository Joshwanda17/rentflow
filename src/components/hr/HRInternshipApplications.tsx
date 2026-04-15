import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GraduationCap, Search, Users } from 'lucide-react';
import { format } from 'date-fns';

export default function HRInternshipApplications() {
  const [search, setSearch] = useState('');

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['internship-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internship_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = applications.filter((app) => {
    const q = search.toLowerCase();
    return (
      app.full_name.toLowerCase().includes(q) ||
      app.phone.toLowerCase().includes(q) ||
      (app.email?.toLowerCase().includes(q) ?? false) ||
      (app.referral_code?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Internship Applications</h2>
          <Badge variant="secondary" className="text-xs">
            <Users className="h-3 w-3 mr-1" />
            {applications.length}
          </Badge>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading applications...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No applications found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Motivation</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Ready to Learn</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Applied At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.full_name}</TableCell>
                    <TableCell>{app.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{app.email || '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={app.motivation || ''}>
                      {app.motivation || '—'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={app.skills || ''}>
                      {app.skills || '—'}
                    </TableCell>
                    <TableCell>
                      {app.ready_to_learn ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-0">Ready</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Exploring</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{app.referral_code || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(app.created_at), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
