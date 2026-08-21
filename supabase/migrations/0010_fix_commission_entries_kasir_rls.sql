-- Allow a cashier to record the therapist commission generated when a
-- completed session is paid.  The existing commission_entries_manage policy
-- intentionally remains limited to admins, owners, and managers so cashiers
-- cannot update or delete commission records after they have been created.

drop policy if exists commission_entries_kasir_insert on commission_entries;

create policy commission_entries_kasir_insert on commission_entries
  for insert to authenticated
  with check (
    _current_role() = 'kasir'
    and _current_outlet_id() = outlet_id
    and outlet_id in (
      select id
      from outlets
      where tenant_id = _current_tenant_id()
    )
  );
