import { useEffect, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import PersonalLayout from '@/components/layout/PersonalLayout';
import { supabase } from '@/integrations/supabase/client';
import DocumentViewer from '@/components/documents/DocumentViewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const DOCUMENTS_BUCKET = 'hr-documents';

interface MyDocumentRow {
  id: string;
  title: string | null;
  storage_path: string | null;
  version: number | null;
  uploaded_at: string | null;
  doc_type_name: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Builds the public-object URL form that getSignedUrl knows how to sign. */
function toStorageUrl(path: string): string {
  if (path.includes('/storage/v1/object/')) return path;
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const clean = path.replace(/^\/+/, '');
  return `${base}/storage/v1/object/public/${DOCUMENTS_BUCKET}/${clean}`;
}

/** Read-only self-service list of documents HR has filed for the signed-in person. */
export default function MyDocuments() {
  const [rows, setRows] = useState<MyDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error: queryError } = await supabase
        .from('hr_documents')
        .select('id, title, storage_path, version, uploaded_at, hr_doc_types(name)')
        .is('superseded_by', null)
        .order('uploaded_at', { ascending: false });

      if (!alive) return;
      if (queryError) {
        setError('Could not load your documents. Please try again.');
      } else {
        setRows(
          (data ?? []).map((row: any) => ({
            id: row.id,
            title: row.title,
            storage_path: row.storage_path,
            version: row.version,
            uploaded_at: row.uploaded_at,
            doc_type_name: row.hr_doc_types?.name ?? null,
          }))
        );
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleOpen = async (row: MyDocumentRow) => {
    setError(null);
    if (!row.storage_path) {
      setError('This document has no file attached. Please contact HR.');
      return;
    }
    setOpeningId(row.id);
    try {
      const storageUrl = toStorageUrl(row.storage_path);
      const signed = await getSignedUrl(storageUrl);
      if (!signed || signed === storageUrl) {
        setError('Could not create a secure link for this document. Please contact HR.');
        return;
      }
      window.open(signed, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Could not create a secure link for this document. Please contact HR.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <PersonalLayout title="My documents">
      <Card>
        <CardContent className="pt-6">
          {loading && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
              Loading your documents…
            </p>
          )}
          {error && (
            <p role="alert" className="mb-4 text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet. Contracts, letters and certificates filed by HR appear here.
            </p>
          )}
          {!loading && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title ?? 'Untitled'}</TableCell>
                    <TableCell>{row.doc_type_name ?? '—'}</TableCell>
                    <TableCell>{row.version ?? '—'}</TableCell>
                    <TableCell>{formatDate(row.uploaded_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={openingId === row.id}
                        onClick={() => void handleOpen(row)}
                      >
                        {openingId === row.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        )}
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PersonalLayout>
  );
}
