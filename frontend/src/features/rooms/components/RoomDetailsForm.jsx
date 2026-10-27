import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surfaces.jsx';
import { Input, Select, Textarea } from '@/components/ui/form-controls.jsx';
import { FormField } from '@/components/shared/index.jsx';
import { BED_TYPE_OPTIONS } from '@/features/rooms/roomForm.js';

/** Inline-validated room fields in four sections. The parent owns the form instance. */
export function RoomDetailsForm({ form, policies, roomCategoryOptions = [], disabled, roomCodeReadOnly = false }) {
  const { register, formState } = form;
  const e = formState.errors;
  const field = (name) => ({ id: name, invalid: Boolean(e[name]), disabled, 'aria-describedby': e[name] ? `${name}-error` : undefined });
  const currentCategory = form.watch('category');
  const hasCurrentCategory = roomCategoryOptions.some((option) => option.value === currentCategory);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
          <CardDescription>What guests see first. The room code is used by your team and must be unique in this hotel.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField id="name" label="Room name" error={e.name?.message}>
            <Input {...field('name')} placeholder="Deluxe King Room" {...register('name')} />
          </FormField>
          <FormField id="roomCode" label="Room code" error={e.roomCode?.message} hint="Generated automatically for this hotel, for example RM_01.">
            <Input {...field('roomCode')} className="uppercase" readOnly={roomCodeReadOnly} aria-readonly={roomCodeReadOnly} {...register('roomCode')} />
          </FormField>
          <FormField id="category" label="Room type" error={e.category?.message}>
            <Select {...field('category')} {...register('category')}>
              {!hasCurrentCategory && currentCategory && <option value={currentCategory}>{currentCategory.replaceAll('_', ' ')}</option>}
              {roomCategoryOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField id="status" label="Status" error={e.status?.message} hint="Inactive rooms are hidden from guests.">
            <Select {...field('status')} {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </FormField>
          <FormField id="description" label="Description" error={e.description?.message} className="sm:col-span-2">
            <Textarea {...field('description')} {...register('description')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capacity</CardTitle>
          <CardDescription>Limits per room. Searches only offer a room to parties that fit these numbers.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <FormField id="maxAdults" label="Maximum adults" error={e.maxAdults?.message}>
            <Input type="number" inputMode="numeric" min={1} {...field('maxAdults')} {...register('maxAdults')} />
          </FormField>
          <FormField id="maxChildren" label="Maximum children" error={e.maxChildren?.message}>
            <Input type="number" inputMode="numeric" min={0} {...field('maxChildren')} {...register('maxChildren')} />
          </FormField>
          <FormField id="maxOccupancy" label="Maximum occupancy" error={e.maxOccupancy?.message} hint="Adults plus children">
            <Input type="number" inputMode="numeric" min={1} {...field('maxOccupancy')} {...register('maxOccupancy')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bed and room</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField id="bedType" label="Bed type" error={e.bedType?.message}>
            <Select {...field('bedType')} {...register('bedType')}>
              {BED_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField id="bedCount" label="Number of beds" error={e.bedCount?.message}>
            <Input type="number" inputMode="numeric" min={1} {...field('bedCount')} {...register('bedCount')} />
          </FormField>
          <FormField id="roomSizeSqm" label="Room size (m²)" error={e.roomSizeSqm?.message}>
            <Input type="number" inputMode="decimal" min={0} step="0.5" {...field('roomSizeSqm')} {...register('roomSizeSqm')} />
          </FormField>
          <FormField id="view" label="View" error={e.view?.message} hint="Example: Sea view, City view, Garden">
            <Input {...field('view')} {...register('view')} />
          </FormField>
          <FormField id="smoking" label="Smoking" error={e.smoking?.message}>
            <Select {...field('smoking')} {...register('smoking')}>
              <option value="NON_SMOKING">Non-smoking</option>
              <option value="SMOKING">Smoking</option>
            </Select>
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory and cancellation</CardTitle>
          <CardDescription>How many of this room you have, and the default policy for its rates.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField id="totalUnits" label="Number of rooms" error={e.totalUnits?.message} hint="Physical rooms of this type. Dates can override this in the calendar.">
            <Input type="number" inputMode="numeric" min={0} {...field('totalUnits')} {...register('totalUnits')} />
          </FormField>
          <FormField id="cancellationPolicyId" label="Default cancellation policy" error={e.cancellationPolicyId?.message} hint="Rates can use their own policy.">
            <Select {...field('cancellationPolicyId')} {...register('cancellationPolicyId')}>
              <option value="">None</option>
              {policies
                .filter((p) => p.status === 'ACTIVE')
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </Select>
          </FormField>
        </CardContent>
      </Card>
    </div>
  );
}
