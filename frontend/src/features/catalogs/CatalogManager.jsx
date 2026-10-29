import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox, Input, Select } from '@/components/ui/form-controls.jsx';
import { Alert, Badge, Card } from '@/components/ui/surfaces.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSkeleton } from '@/components/ui/table.jsx';
import { catalogApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { AMENITY_CATEGORIES, MASTER_DEFINITIONS } from './catalogs.js';
import { invalidateCatalog, useCatalog } from './useCatalog.js';

function MasterRow({ kind, item, onChanged }) {
  const definition = MASTER_DEFINITIONS[kind];
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category ?? 'OTHER');
  const [mealFlags, setMealFlags] = useState({ breakfast: item.includesBreakfast ?? false, lunch: item.includesLunch ?? false, dinner: item.includesDinner ?? false });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setName(item.name);
    setCategory(item.category ?? 'OTHER');
    setMealFlags({ breakfast: item.includesBreakfast ?? false, lunch: item.includesLunch ?? false, dinner: item.includesDinner ?? false });
    setEditing(false);
  }, [item]);

  const save = async (patch) => {
    setSaving(true);
    try {
      await catalogApi.update(kind, item.code, patch);
      invalidateCatalog(kind);
      toast.success(`${definition.singular} updated`);
      setEditing(false);
      await onChanged();
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setName(item.name);
    setCategory(item.category ?? 'OTHER');
    setMealFlags({ breakfast: item.includesBreakfast ?? false, lunch: item.includesLunch ?? false, dinner: item.includesDinner ?? false });
    setEditing(false);
  };

  return (
    <TableRow>
      <TableCell className="min-w-[240px]">
        {editing ? <Input aria-label={`${item.code} name`} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /> : <span className="font-medium text-[var(--text-strong)]">{item.name}</span>}
      </TableCell>
      <TableCell className="font-mono text-xs text-[var(--text-muted)]">{item.code}</TableCell>
      {definition.needsCategory && (
        <TableCell className="min-w-[190px] text-[var(--text-body)]">
          {editing ? (
            <Select aria-label={`${item.code} category`} value={category} onChange={(event) => setCategory(event.target.value)}>
              {AMENITY_CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </Select>
          ) : item.category.replaceAll('_', ' ')
          }
        </TableCell>
      )}
      {definition.needsMealFlags && (
        <TableCell className="min-w-[280px] text-[var(--text-body)]">
          {editing ? (
            <div className="flex flex-wrap gap-3">
              <Checkbox label="Breakfast" checked={mealFlags.breakfast} onChange={(event) => setMealFlags((value) => ({ ...value, breakfast: event.target.checked }))} />
              <Checkbox label="Lunch" checked={mealFlags.lunch} onChange={(event) => setMealFlags((value) => ({ ...value, lunch: event.target.checked }))} />
              <Checkbox label="Dinner" checked={mealFlags.dinner} onChange={(event) => setMealFlags((value) => ({ ...value, dinner: event.target.checked }))} />
            </div>
          ) : [item.includesBreakfast && 'Breakfast', item.includesLunch && 'Lunch', item.includesDinner && 'Dinner'].filter(Boolean).join(', ') || 'No meals'}
        </TableCell>
      )}
      <TableCell><Badge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
      <TableCell className="whitespace-nowrap text-right">
        <div className="inline-flex items-center gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" loading={saving} disabled={!name.trim()} onClick={() => save({ name: name.trim(), ...(definition.needsCategory && { category }), ...(definition.needsMealFlags && { includesBreakfast: mealFlags.breakfast, includesLunch: mealFlags.lunch, includesDinner: mealFlags.dinner }) })}><Save className="h-3.5 w-3.5" /> Save</Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={cancelEdit}><X className="h-3.5 w-3.5" /> Cancel</Button>
            </>
          ) : <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
          <Button size="sm" variant="ghost" loading={saving} onClick={() => save({ isActive: !item.isActive })}>{item.isActive ? 'Deactivate' : 'Activate'}</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CatalogManager({ kind }) {
  const definition = MASTER_DEFINITIONS[kind];
  const { items, loading, error, refresh } = useCatalog(kind, { admin: true });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [mealFlags, setMealFlags] = useState({ breakfast: false, lunch: false, dinner: false });
  const [saving, setSaving] = useState(false);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await catalogApi.create(kind, { name: name.trim(), ...(code.trim() && { code: code.trim().toUpperCase() }), ...(definition.needsCategory && { category }), ...(definition.needsMealFlags && { includesBreakfast: mealFlags.breakfast, includesLunch: mealFlags.lunch, includesDinner: mealFlags.dinner }) });
      invalidateCatalog(kind);
      setName('');
      setCode('');
      setMealFlags({ breakfast: false, lunch: false, dinner: false });
      toast.success(`${definition.singular} created`);
      await refresh();
    } catch (nextError) {
      toast.error(normalizeError(nextError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Add {definition.singular}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">The new value becomes available in the relevant dropdown immediately. Code is generated automatically when left blank.</p>
        </div>
        <form
          onSubmit={create}
          className={`grid gap-4 md:items-end ${definition.needsCategory || definition.needsMealFlags
            ? 'md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto]'
            : 'md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]'}`}
        >
          <label className="space-y-1.5 text-sm font-medium text-[var(--text-strong)]">Name<Input placeholder={`Enter ${definition.singular} name`} value={name} required minLength={2} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium text-[var(--text-strong)]">Code <span className="font-normal text-[var(--text-muted)]">(optional)</span><Input placeholder="AUTO_GENERATED" className="font-mono uppercase" value={code} maxLength={40} onChange={(event) => setCode(event.target.value)} /></label>
          {definition.needsCategory && (
            <label className="space-y-1.5 text-sm font-medium text-[var(--text-strong)]">Category<Select value={category} onChange={(event) => setCategory(event.target.value)}>{AMENITY_CATEGORIES.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select></label>
          )}
          {definition.needsMealFlags && (
            <div className="flex min-h-10 flex-wrap items-center gap-3">
              <Checkbox label="Breakfast" checked={mealFlags.breakfast} onChange={(event) => setMealFlags((value) => ({ ...value, breakfast: event.target.checked }))} />
              <Checkbox label="Lunch" checked={mealFlags.lunch} onChange={(event) => setMealFlags((value) => ({ ...value, lunch: event.target.checked }))} />
              <Checkbox label="Dinner" checked={mealFlags.dinner} onChange={(event) => setMealFlags((value) => ({ ...value, dinner: event.target.checked }))} />
            </div>
          )}
          <Button type="submit" loading={saving} disabled={!name.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </form>
      </Card>

      {error && <Alert tone="error">{normalizeError(error).message}</Alert>}

      <Card className="overflow-hidden rounded-none">
        <div className="border-b border-[var(--border-subtle)] px-4 py-4">
          <h2 className="text-base font-semibold text-[var(--text-strong)]">{definition.label}</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{items.length} value{items.length === 1 ? '' : 's'} · Deactivate values instead of deleting them.</p>
        </div>
        {loading ? <TableSkeleton rows={5} /> : (
          <Table minWidth={definition.needsCategory || definition.needsMealFlags ? '860px' : '680px'}>
            <caption className="sr-only">{definition.label}</caption>
            <TableHeader><TableRow interactive={false}><TableHead>Name</TableHead><TableHead>Code</TableHead>{definition.needsCategory && <TableHead>Category</TableHead>}{definition.needsMealFlags && <TableHead>Includes</TableHead>}<TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item) => <MasterRow key={item.code} kind={kind} item={item} onChanged={refresh} />)}</TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
