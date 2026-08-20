-- Adds a real staff-photo field to employees. Needed so therapist
-- avatars/gallery cards can show an actual headshot instead of always
-- falling back to initials-on-color-tone — see lib/data/employees.ts
-- (mapEmployee -> photoUrl) and components/ui.tsx's Avatar/PersonCell.
--
-- Nullable and no default: most employees (non-therapist staff, and any
-- therapist without a photo yet) simply have NULL here, which the app
-- treats as "no photo" and falls back to the initials avatar — same
-- optional-field convention as bio/featured_badge on this table.
alter table employees add column if not exists photo_url text;
