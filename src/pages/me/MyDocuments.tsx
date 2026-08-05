import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, ExternalLink, Loader2 } from 'lucide-react';
import PersonalLayout from '@/components/layout/PersonalLayout';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { getSignedUrl } from '@/lib/storageUtils';

const BUCKET = 'hr-documents';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

interface DocumentRow {
  id: string;
  title: string | null;
  storage_path: string | null;
  version: number | null;
  uploaded_at: string | null;
  hr_doc_types: { name: string | null } | null;
}

const formatDate = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const buildObjectUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

const MyDocuments = () => {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['my-documents'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('hr_documents')
        .select('id, title, storage_path, version, uploaded_at, hr_doc_types(name)')
        .is('superseded_by', null)
        .order('uploaded_at', { ascending: false });

      if (queryError) throw queryError;
      return (data || []) as unknown as DocumentRow[];
    },
  });

  const handleOpen = async (doc: DocumentRow) => {
    setOpenError(null);

    if (!doc.storage_path) {
      setOpenError('This document has no stored file. Please contact your people team.');
      return;
    }

    setOpeningId(doc.id);
    try {
      const objectUrl = buildObjectUrl(doc.storage_path);
      const signed = await getSignedUrl(objectUrl);

      if (!signed || signed === objectUrl || !signed.includes('token=')) {
        setOpenError('We could not create a secure link for this document. Please try again.');
        return;
      }

      window.open(signed, '_blank', 'noopener,noreferrer');
    } catch {
      setOpenError('We could not create a secure link for this document. Please try again.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <PersonalLayout title="My documents">
      {openError && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {openError}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          We could not load your documents. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !documents || documents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FolderOpen className="h-6 w-6" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            No documents yet. Contracts, letters and certificates filed by HR appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
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
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.title || 'Untitled document'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.hr_doc_types?.name || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">v{doc.version ?? 1}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(doc.uploaded_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpen(doc)}
                      disabled={openingId === doc.id}
                    >
                      {openingId === doc.id ? (
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
        </div>
      )}
    </PersonalLayout>
  );
};

export default MyDocuments;
