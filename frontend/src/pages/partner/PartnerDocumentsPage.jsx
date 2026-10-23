import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PageHeader, FullPageSpinner } from '@/components/shared/index.jsx';
import { DOCUMENT_TYPE_OPTIONS } from '@/features/partner/schemas.js';
import { partnerApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const REQUIRED_DOC_TYPES = ['BUSINESS_REGISTRATION', 'GOVERNMENT_ID'];

function DocumentRow({ docType, label, uploaded, onUpload }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputId = `doc-${docType}`;

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await onUpload(file, docType);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-[var(--text-strong)]">
            {label} {REQUIRED_DOC_TYPES.includes(docType) && <span className="text-danger-600">*</span>}
          </p>
          {error && <p className="text-xs text-danger-600">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {uploaded ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Uploaded</Badge> : <Badge tone="neutral">Not uploaded</Badge>}
        <label htmlFor={inputId}>
          <input id={inputId} type="file" accept=".jpg,.jpeg,.png,.pdf" className="sr-only" onChange={handleChange} disabled={uploading} />
          <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => document.getElementById(inputId)?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploaded ? 'Replace' : 'Upload'}
          </Button>
        </label>
      </div>
    </div>
  );
}

export function PartnerDocumentsPage() {
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    partnerApi
      .getApplication()
      .then(setApplication)
      .catch((err) => setError(normalizeError(err).message));
  }, []);

  useEffect(() => load(), [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!application) return <FullPageSpinner label="Loading your application" />;
  if (application.status !== 'DRAFT' && application.status !== 'REJECTED') return <Navigate to="/partner/status" replace />;

  const uploadedTypes = new Set(application.documents.map((doc) => doc.docType));
  const missingRequired = REQUIRED_DOC_TYPES.filter((type) => !uploadedTypes.has(type));

  const handleUpload = async (file, docType) => {
    await partnerApi.uploadDocument(file, docType);
    load();
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await partnerApi.submit();
      navigate('/partner/status', { replace: true });
    } catch (err) {
      setSubmitError(normalizeError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Verification documents"
        description="Upload the documents below, then submit your application for review."
      />

      {application.status === 'REJECTED' && application.rejectionReason && (
        <Alert tone="warning" title="Your previous submission was not approved">
          {application.rejectionReason} Update your documents and submit again.
        </Alert>
      )}

      <Card className="overflow-hidden">
        {DOCUMENT_TYPE_OPTIONS.map((option) => (
          <DocumentRow key={option.value} docType={option.value} label={option.label} uploaded={uploadedTypes.has(option.value)} onUpload={handleUpload} />
        ))}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ready to submit?</CardTitle>
          <CardDescription>
            {missingRequired.length > 0
              ? `Upload the remaining required documents to submit: ${missingRequired.join(', ')}.`
              : 'All required documents are uploaded.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitError && <div className="mb-4"><Alert tone="error">{submitError}</Alert></div>}
          <Button size="lg" className="w-full" disabled={missingRequired.length > 0} loading={submitting} onClick={handleSubmit}>
            Submit application for review
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
