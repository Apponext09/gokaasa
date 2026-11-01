import { useState } from 'react';
import { Pencil, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/form-controls.jsx';
import { useAuth } from './AuthContext.jsx';
import { updateProfileSchema } from './schemas.js';

/**
 * Self-service "edit your own name" control, shared by the customer and staff Profile pages so there is
 * one editing codepath for every role. Drops into the existing Name row of either page's Card.
 */
export function ProfileNameEditor() {
  const { user, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setErrors({});
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setErrors({});
  };

  const save = async (event) => {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({ firstName, lastName });
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateProfile(parsed.data);
      toast.success('Your profile has been updated');
      setEditing(false);
    } catch (error) {
      toast.error(error.message || 'Could not update your profile');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 p-5">
        <UserRound className="h-5 w-5 text-brand-700" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-xs text-[var(--text-muted)]">Name</p>
          <p className="text-sm font-medium text-[var(--text-strong)]">
            {user?.firstName} {user?.lastName}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={startEdit}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit Profile
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4 p-5" onSubmit={save} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-first-name">First name</Label>
          <Input
            id="profile-first-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            invalid={Boolean(errors.firstName)}
            disabled={saving}
            autoComplete="given-name"
            maxLength={80}
          />
          {errors.firstName && <p className="text-xs text-danger-600">{errors.firstName}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-last-name">Last name</Label>
          <Input
            id="profile-last-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            invalid={Boolean(errors.lastName)}
            disabled={saving}
            autoComplete="family-name"
            maxLength={80}
          />
          {errors.lastName && <p className="text-xs text-danger-600">{errors.lastName}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving}>Save Changes</Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
