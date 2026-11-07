-- Gestão de usuários pelo administrador: cadastrar com senha, trocar senha, bloquear, dar acesso e excluir.
-- Tudo exige papel 'admin' (eh_admin). A exclusão passa por /api/admin-usuarios, que cancela as cobranças
-- no Asaas antes de apagar a conta.

create or replace function public.exigir_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'só administradores podem fazer isso' using errcode = '42501'; end if;
end $$;
revoke all on function public.exigir_admin() from public, anon, authenticated;

-- Lista com e-mail completo (só admin), situação de bloqueio, papel e assinaturas.
create or replace function public.admin_listar_usuarios(busca text default '', limite int default 100)
returns table (id uuid, email text, criado_em timestamptz, ultimo_acesso timestamptz, bloqueado boolean, papel text,
               assinatura text, pago_ate timestamptz, profissional text, dias_com_registro bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, coalesce(u.banned_until > now(), false),
      (select pa.papel from public.papeis pa where pa.user_id = u.id),
      (select a.status from public.assinaturas a where a.user_id = u.id),
      (select a.pago_ate from public.assinaturas a where a.user_id = u.id),
      (select p.status from public.profissionais p where p.user_id = u.id),
      (select count(*) from public.dias d where d.user_id = u.id)
    from auth.users u
    where coalesce(busca, '') = '' or u.email ilike '%' || busca || '%'
    order by u.created_at desc
    limit least(greatest(limite, 1), 500);
end $$;
revoke all on function public.admin_listar_usuarios(text, int) from public, anon;
grant execute on function public.admin_listar_usuarios(text, int) to authenticated;

-- Dá (ou tira, com data nula) acesso sem assinatura até uma data: cortesia, permuta, parceiros.
create or replace function public.admin_dar_acesso(usuario uuid, ate date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if ate is null then
    update public.assinaturas set pago_ate = least(pago_ate, now()), atualizado_em = now() where user_id = usuario and asaas_assinatura_id is null;
    return;
  end if;
  if ate < current_date then raise exception 'a data precisa ser hoje ou depois'; end if;
  insert into public.assinaturas as a (user_id, status, pago_ate) values (usuario, 'ativa', (ate + 1)::timestamptz)
  on conflict (user_id) do update set status = 'ativa', pago_ate = greatest(coalesce(a.pago_ate, now()), (ate + 1)::timestamptz), atualizado_em = now();
end $$;
revoke all on function public.admin_dar_acesso(uuid, date) from public, anon;
grant execute on function public.admin_dar_acesso(uuid, date) to authenticated;

create or replace function public.admin_criar_usuario(email text, senha text, acesso_ate date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare novo uuid := gen_random_uuid(); e text := lower(trim(email));
begin
  perform public.exigir_admin();
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail inválido'; end if;
  if length(coalesce(senha, '')) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = e) then raise exception 'já existe uma conta com esse e-mail'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', novo, 'authenticated', 'authenticated', e, extensions.crypt(senha, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"criado_pelo_admin":true}', now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (novo::text, novo, jsonb_build_object('sub', novo::text, 'email', e, 'email_verified', true), 'email', now(), now());
  if acesso_ate is not null then perform public.admin_dar_acesso(novo, acesso_ate); end if;
  return novo;
end $$;
revoke all on function public.admin_criar_usuario(text, text, date) from public, anon;
grant execute on function public.admin_criar_usuario(text, text, date) to authenticated;

create or replace function public.admin_definir_senha(usuario uuid, senha text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if length(coalesce(senha, '')) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  update auth.users set encrypted_password = extensions.crypt(senha, extensions.gen_salt('bf')), updated_at = now() where id = usuario;
  if not found then raise exception 'usuário não encontrado'; end if;
  -- Senha nova derruba as sessões abertas em outros aparelhos.
  delete from auth.sessions where user_id = usuario;
end $$;
revoke all on function public.admin_definir_senha(uuid, text) from public, anon;
grant execute on function public.admin_definir_senha(uuid, text) to authenticated;

create or replace function public.admin_bloquear_usuario(usuario uuid, bloquear boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if usuario = (select auth.uid()) then raise exception 'você não pode bloquear a própria conta'; end if;
  update auth.users set banned_until = case when bloquear then '2999-12-31 00:00:00+00'::timestamptz else null end, updated_at = now() where id = usuario;
  if not found then raise exception 'usuário não encontrado'; end if;
  if bloquear then delete from auth.sessions where user_id = usuario; end if;
end $$;
revoke all on function public.admin_bloquear_usuario(uuid, boolean) from public, anon;
grant execute on function public.admin_bloquear_usuario(uuid, boolean) to authenticated;

-- Dados de cobrança do usuário (para a função cancelar no Asaas antes de excluir).
create or replace function public.admin_cobrancas_do_usuario(usuario uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'paciente', (select jsonb_build_object('assinatura', a.asaas_assinatura_id, 'status', a.status, 'ambiente', a.ambiente) from public.assinaturas a where a.user_id = usuario),
    'profissional', (select jsonb_build_object('assinatura', a.asaas_assinatura_id, 'status', a.status, 'ambiente', a.ambiente) from public.assinaturas_prof a where a.user_id = usuario));
end $$;
revoke all on function public.admin_cobrancas_do_usuario(uuid) from public, anon;
grant execute on function public.admin_cobrancas_do_usuario(uuid) to authenticated;

create or replace function public.admin_excluir_usuario(usuario uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_admin();
  if usuario = (select auth.uid()) then raise exception 'você não pode excluir a própria conta por aqui'; end if;
  if exists (select 1 from public.papeis where user_id = usuario and papel = 'admin') then raise exception 'remova o papel de administrador antes de excluir'; end if;
  delete from auth.users where id = usuario;
  if not found then raise exception 'usuário não encontrado'; end if;
  insert into public.exclusoes default values;
end $$;
revoke all on function public.admin_excluir_usuario(uuid) from public, anon;
grant execute on function public.admin_excluir_usuario(uuid) to authenticated;

-- Conta bloqueada não tem acesso, mesmo com assinatura em dia (vale para o app e para a área do profissional).
create or replace function public.meu_acesso()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'equipe', public.eh_equipe(),
    'bloqueado', coalesce(us.banned_until > now(), false),
    'liberado', not coalesce(us.banned_until > now(), false) and (public.eh_equipe() or coalesce(a.pago_ate > now(), false)),
    'status', a.status, 'plano_id', a.plano_id, 'plano_nome', p.nome, 'meses', p.meses, 'preco', p.preco,
    'pago_ate', a.pago_ate, 'link_pagamento', a.link_pagamento, 'ambiente', a.ambiente,
    'asaas_cliente_id', a.asaas_cliente_id, 'asaas_assinatura_id', a.asaas_assinatura_id)
  from (select (select auth.uid()) as uid) u
  join auth.users us on us.id = u.uid
  left join public.assinaturas a on a.user_id = u.uid
  left join public.planos p on p.id = a.plano_id
  where u.uid is not null
$$;

create or replace function public.prof_liberado(usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from auth.users where id = usuario and banned_until > now())
    and (exists (select 1 from public.papeis where user_id = usuario)
      or (exists (select 1 from public.profissionais where user_id = usuario and status = 'verificado')
          and exists (select 1 from public.assinaturas_prof where user_id = usuario and pago_ate > now())))
$$;
