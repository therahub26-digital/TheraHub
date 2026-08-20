-- ============================================================
-- TheraHub — Row Level Security policies (Phase 4: auth)
--
-- 0001_init.sql enabled RLS everywhere with a single "service_role can do
-- anything" policy, so the app could keep working via the service-role
-- client while phase 1-3 were built. This migration ADDS real per-role
-- policies on top of that (does not remove the service_role policy — the
-- service_role key is still used for admin scripts and the Midtrans
-- webhook, which must bypass RLS).
--
-- Identity model:
--   - Staff (super-admin, admin, owner, manager, kasir, therapist) sign in
--     via Supabase Auth and are linked through app_users.auth_user_id.
--   - Customers sign in separately and are linked through
--     customers.auth_user_id (they never get an app_users row).
--
-- Scope model (matches the role cards on the landing page):
--   - super-admin / admin / owner : tenant-wide (their own tenant only)
--   - manager / kasir             : their assigned outlet only
--   - therapist                   : their own employee_id records only
--   - customer                    : their own customer_id records only
-- ============================================================

-- ---------------------------------------------------------- helper fns
-- security definer + fixed search_path: these read app_users/customers,
-- which themselves have RLS enabled, so they must bypass RLS to avoid
-- infinite recursion (a policy that queries a table protected by that same
-- policy). This is the standard Supabase pattern for RLS helper functions.

create or replace function _current_app_user()
returns app_users
language sql security definer stable set search_path = public as $$
  select * from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function _current_app_user_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function _current_tenant_id() returns uuid
language sql security definer stable set search_path = public as $$
  select tenant_id from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function _current_outlet_id() returns uuid
language sql security definer stable set search_path = public as $$
  select outlet_id from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function _current_role() returns app_role
language sql security definer stable set search_path = public as $$
  select role from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function _current_employee_id() returns uuid
language sql security definer stable set search_path = public as $$
  select employee_id from app_users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function _current_customer_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from customers where auth_user_id = auth.uid() limit 1;
$$;

-- tenant id of whichever identity is signed in — staff OR customer. Used
-- for tenant-wide reference/catalog data that both sides need to browse
-- (outlets, services, promotions).
create or replace function _effective_tenant_id() returns uuid
language sql security definer stable set search_path = public as $$
  select coalesce(
    (select tenant_id from app_users where auth_user_id = auth.uid() limit 1),
    (select tenant_id from customers where auth_user_id = auth.uid() limit 1)
  );
$$;

create or replace function _is_admin_or_owner() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(_current_role() in ('super-admin','admin','owner'), false);
$$;

create or replace function _is_manager_here(p_outlet_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(_current_role() = 'manager' and _current_outlet_id() = p_outlet_id, false);
$$;

create or replace function _is_outlet_staff(p_outlet_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(_current_role() in ('manager','kasir') and _current_outlet_id() = p_outlet_id, false);
$$;

create or replace function _outlet_tenant_id(p_outlet_id uuid) returns uuid
language sql stable set search_path = public as $$
  select tenant_id from outlets where id = p_outlet_id;
$$;

-- ---------------------------------------------------------------- plans
-- Global reference data — safe to expose to any signed-in identity.
create policy plans_read on plans for select to authenticated using (true);
create policy feature_flags_read on feature_flags for select to authenticated using (true);

-- --------------------------------------------------------------- tenant
create policy tenants_read_own on tenants
  for select to authenticated using (id = _effective_tenant_id());

create policy tenant_modules_read on tenant_modules
  for select to authenticated using (tenant_id = _effective_tenant_id());

create policy feature_flag_tenants_read on feature_flag_tenants
  for select to authenticated using (tenant_id = _effective_tenant_id());

-- ------------------------------------------------------------ app_users
create policy app_users_read_self on app_users
  for select to authenticated using (auth_user_id = auth.uid());

create policy app_users_read_tenant_admin on app_users
  for select to authenticated using (tenant_id = _current_tenant_id() and _is_admin_or_owner());

create policy app_users_write_admin on app_users
  for insert to authenticated with check (tenant_id = _current_tenant_id() and _is_admin_or_owner());

create policy app_users_update_admin on app_users
  for update to authenticated
  using (tenant_id = _current_tenant_id() and _is_admin_or_owner())
  with check (tenant_id = _current_tenant_id() and _is_admin_or_owner());

create policy app_users_delete_admin on app_users
  for delete to authenticated using (tenant_id = _current_tenant_id() and _is_admin_or_owner());

-- ------------------------------------------------------------------ org
create policy outlets_read on outlets
  for select to authenticated using (tenant_id = _effective_tenant_id());

create policy outlets_write_admin on outlets
  for all to authenticated
  using (tenant_id = _current_tenant_id() and _is_admin_or_owner())
  with check (tenant_id = _current_tenant_id() and _is_admin_or_owner());

create policy outlets_update_manager on outlets
  for update to authenticated
  using (_is_manager_here(id))
  with check (_is_manager_here(id));

create policy outlet_profiles_read on outlet_profiles
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));

create policy outlet_profiles_write on outlet_profiles
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy outlet_facilities_read on outlet_facilities
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));

create policy outlet_facilities_write on outlet_facilities
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy outlet_gallery_photos_read on outlet_gallery_photos
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));

create policy outlet_gallery_photos_write on outlet_gallery_photos
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy rooms_read on rooms
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));

create policy rooms_write on rooms
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

-- --------------------------------------------------------------- people
-- Employee directory is readable tenant-wide (staff need it for rosters;
-- customers need it to pick a therapist when booking).
create policy employees_read on employees
  for select to authenticated using (tenant_id = _effective_tenant_id());

create policy employees_write on employees
  for all to authenticated
  using (_is_admin_or_owner() and tenant_id = _current_tenant_id() or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and tenant_id = _current_tenant_id() or _is_manager_here(outlet_id));

create policy employee_day_off_read on employee_day_off
  for select to authenticated using (
    employee_id in (select id from employees where tenant_id = _current_tenant_id())
    or employee_id = _current_employee_id()
  );

create policy employee_day_off_write on employee_day_off
  for all to authenticated
  using (
    employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id())
    or employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
  )
  with check (
    employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id())
    or employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
  );

create policy employee_leave_read on employee_leave
  for select to authenticated using (
    employee_id in (select id from employees where tenant_id = _current_tenant_id())
    or employee_id = _current_employee_id()
  );

create policy employee_leave_self_insert on employee_leave
  for insert to authenticated with check (employee_id = _current_employee_id());

create policy employee_leave_manage on employee_leave
  for all to authenticated
  using (
    employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id())
    or employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
  )
  with check (
    employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id())
    or employee_id in (select id from employees e where _is_manager_here(e.outlet_id))
  );

create policy attendance_events_read on attendance_events
  for select to authenticated using (
    outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or employee_id = _current_employee_id()
  );

create policy attendance_events_self on attendance_events
  for all to authenticated
  using (employee_id = _current_employee_id())
  with check (employee_id = _current_employee_id());

create policy attendance_events_manage on attendance_events
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

-- ------------------------------------------------------------- catalog
-- Read: tenant-wide for both staff and customers (needed for booking flow).
-- Write: admin/owner only.
create policy service_categories_read on service_categories for select to authenticated using (tenant_id = _effective_tenant_id());
create policy service_categories_write on service_categories for all to authenticated using (tenant_id = _current_tenant_id() and _is_admin_or_owner()) with check (tenant_id = _current_tenant_id() and _is_admin_or_owner());

-- service_types is scoped via its category (which carries tenant_id).
create policy service_types_read on service_types
  for select to authenticated using (category_id in (select id from service_categories where tenant_id = _effective_tenant_id()));
create policy service_types_write on service_types
  for all to authenticated
  using (category_id in (select id from service_categories where tenant_id = _current_tenant_id()) and _is_admin_or_owner())
  with check (category_id in (select id from service_categories where tenant_id = _current_tenant_id()) and _is_admin_or_owner());

-- service_packages, extension_options, add_ons are scoped per outlet (each
-- outlet prices its own menu), so tenant scope goes through outlet_id.
create policy service_packages_read on service_packages
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));
create policy service_packages_write on service_packages
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy service_package_allowed_extensions_read on service_package_allowed_extensions
  for select to authenticated using (package_id in (select id from service_packages where outlet_id in (select id from outlets where tenant_id = _effective_tenant_id())));
create policy service_package_allowed_extensions_write on service_package_allowed_extensions
  for all to authenticated
  using (package_id in (select sp.id from service_packages sp where _is_admin_or_owner() and sp.outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(sp.outlet_id)))
  with check (package_id in (select sp.id from service_packages sp where _is_admin_or_owner() and sp.outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(sp.outlet_id)));

create policy extension_options_read on extension_options
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));
create policy extension_options_write on extension_options
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy add_ons_read on add_ons
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));
create policy add_ons_write on add_ons
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

-- ----------------------------------------------------------- customers
create policy customers_read_self on customers
  for select to authenticated using (auth_user_id = auth.uid());

create policy customers_update_self on customers
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy customers_staff_manage on customers
  for all to authenticated
  using (tenant_id = _current_tenant_id() and _current_role() in ('super-admin','admin','owner','manager','kasir'))
  with check (tenant_id = _current_tenant_id() and _current_role() in ('super-admin','admin','owner','manager','kasir'));

-- ------------------------------------------------------- booking/session
create policy bookings_customer on bookings
  for all to authenticated
  using (customer_id = _current_customer_id())
  with check (customer_id = _current_customer_id());

create policy bookings_therapist_read on bookings
  for select to authenticated using (therapist_id = _current_employee_id());

create policy bookings_staff on bookings
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

-- booking_deposits: read-only for authenticated (Midtrans writes happen
-- exclusively through the service_role webhook handler — see admin.ts).
create policy booking_deposits_read_customer on booking_deposits
  for select to authenticated using (booking_id in (select id from bookings where customer_id = _current_customer_id()));

create policy booking_deposits_read_staff on booking_deposits
  for select to authenticated using (
    booking_id in (
      select b.id from bookings b
      where _is_admin_or_owner() and b.outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(b.outlet_id)
    )
  );

create policy sessions_therapist on sessions
  for all to authenticated
  using (therapist_id = _current_employee_id())
  with check (therapist_id = _current_employee_id());

create policy sessions_customer_read on sessions
  for select to authenticated using (booking_id in (select id from bookings where customer_id = _current_customer_id()));

create policy sessions_staff on sessions
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

create policy extension_requests_therapist on extension_requests
  for all to authenticated
  using (session_id in (select id from sessions where therapist_id = _current_employee_id()))
  with check (session_id in (select id from sessions where therapist_id = _current_employee_id()));

create policy extension_requests_staff on extension_requests
  for all to authenticated
  using (
    session_id in (
      select s.id from sessions s
      where _is_admin_or_owner() and s.outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(s.outlet_id)
    )
  )
  with check (
    session_id in (
      select s.id from sessions s
      where _is_admin_or_owner() and s.outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(s.outlet_id)
    )
  );

-- --------------------------------------------------------------- POS
create policy transactions_customer_read on transactions
  for select to authenticated using (customer_id = _current_customer_id());

create policy transactions_staff on transactions
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

create policy transaction_items_customer_read on transaction_items
  for select to authenticated using (transaction_id in (select id from transactions where customer_id = _current_customer_id()));

create policy transaction_items_staff on transaction_items
  for all to authenticated
  using (
    transaction_id in (
      select t.id from transactions t
      where _is_admin_or_owner() and t.outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(t.outlet_id)
    )
  )
  with check (
    transaction_id in (
      select t.id from transactions t
      where _is_admin_or_owner() and t.outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
         or _is_outlet_staff(t.outlet_id)
    )
  );

-- ----------------------------------------------------------- inventory
create policy products_read on products for select to authenticated using (tenant_id = _current_tenant_id());
create policy products_write on products for all to authenticated using (tenant_id = _current_tenant_id() and _is_admin_or_owner()) with check (tenant_id = _current_tenant_id() and _is_admin_or_owner());

create policy product_stocks_read on product_stocks
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _current_tenant_id()));
create policy product_stocks_write on product_stocks
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

create policy stock_movements_read on stock_movements
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _current_tenant_id()));
create policy stock_movements_write on stock_movements
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_outlet_staff(outlet_id));

-- ------------------------------------------------------------- finance
create policy expenses_read on expenses
  for select to authenticated using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));
create policy expenses_write on expenses
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy commission_entries_therapist_read on commission_entries
  for select to authenticated using (therapist_id = _current_employee_id());
create policy commission_entries_manage on commission_entries
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy payroll_items_self_read on payroll_items
  for select to authenticated using (employee_id = _current_employee_id());
create policy payroll_items_manage on payroll_items
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy savings_entries_self_read on savings_entries
  for select to authenticated using (employee_id = _current_employee_id());
create policy savings_entries_manage on savings_entries
  for all to authenticated
  using (employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id() or _is_manager_here(e.outlet_id)))
  with check (employee_id in (select id from employees e where _is_admin_or_owner() and e.tenant_id = _current_tenant_id() or _is_manager_here(e.outlet_id)));

-- ------------------------------------------------------------ platform
-- audit_logs has no tenant_id column directly — approximate tenant scope
-- via the actor's app_users row. Good enough for a single-tenant phase 1;
-- revisit if/when this becomes a public multi-tenant platform.
create policy audit_logs_read on audit_logs
  for select to authenticated using (
    _is_admin_or_owner() and actor_id in (select id from app_users where tenant_id = _current_tenant_id())
  );

create policy notifications_self on notifications
  for select to authenticated using (recipient_id = _current_app_user_id());
create policy notifications_self_update on notifications
  for update to authenticated using (recipient_id = _current_app_user_id()) with check (recipient_id = _current_app_user_id());

create policy promotions_read on promotions
  for select to authenticated using (outlet_id in (select id from outlets where tenant_id = _effective_tenant_id()));
create policy promotions_write on promotions
  for all to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));

create policy approvals_read on approvals
  for select to authenticated using (
    requested_by = _current_app_user_id()
    or _is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id())
    or _is_manager_here(outlet_id)
  );
create policy approvals_insert on approvals
  for insert to authenticated with check (requested_by = _current_app_user_id());
create policy approvals_decide on approvals
  for update to authenticated
  using (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id))
  with check (_is_admin_or_owner() and outlet_id in (select id from outlets where tenant_id = _current_tenant_id()) or _is_manager_here(outlet_id));
