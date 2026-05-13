import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { sheetsApi } from '../api/spreadsheets';

export function UploadDropzone({ onUploaded }: { onUploaded?: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (files: File[]) => sheetsApi.upload(files),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['sheets'] });
      onUploaded?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  const onDrop = useCallback((accepted: File[]) => {
    setError(null);
    if (accepted.length) upload.mutate(accepted);
  }, [upload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // The server is the source of truth for what's accepted (magic-byte
    // check + extension whitelist). This list is the browser-side hint that
    // mirrors it so the file picker filters correctly.
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
      'text/csv': ['.csv'],
      'text/tab-separated-values': ['.tsv', '.tab'],
    },
    maxSize: 50 * 1024 * 1024,
    disabled: upload.isPending,
  });

  return (
    <div
      {...getRootProps()}
      className={`card cursor-pointer p-8 text-center transition-colors ${
        isDragActive ? 'border-indigo-500 bg-indigo-500/5' : 'hover:border-zinc-700'
      }`}
    >
      <input {...getInputProps()} />
      <div className="text-sm text-zinc-300">
        {upload.isPending
          ? 'Uploading…'
          : isDragActive
            ? 'Drop the files here'
            : 'Drop spreadsheet files here, or click to browse'}
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        .xlsx · .xls · .ods · .csv · .tsv — up to 20 files, 50 MB each
      </div>
      {error && <div className="mt-3 text-xs text-rose-300">{error}</div>}
    </div>
  );
}
