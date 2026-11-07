-- Evolução: o nutricionista autorizado também vê o histórico de peso (últimos 20 registros) do paciente.
create or replace function public.diario_paciente(paciente uuid, de date, ate date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vinculos v join public.profissionais p on p.user_id = v.profissional_id
                 where v.paciente_id = paciente and v.profissional_id = (select auth.uid()) and v.compartilha_diario and p.status = 'verificado') then
    raise exception 'sem autorização para ver este diário' using errcode = '42501';
  end if;
  if ate < de or ate - de > 31 then raise exception 'período inválido (até 31 dias)'; end if;
  return jsonb_build_object(
    'perfil', (select jsonb_build_object('apelido', estado->'perfil'->>'apelido', 'objetivo', estado->'perfil'->>'objetivo', 'dieta', estado->'perfil'->>'dieta',
                 'alergias', estado->'perfil'->'alergias', 'idade', estado->'perfil'->'idade', 'sexo', estado->'perfil'->>'sexo', 'altura', estado->'perfil'->'altura',
                 'peso', estado->'perfil'->'peso', 'atividade', estado->'perfil'->>'atividade') from public.perfis where user_id = paciente),
    'pesos', (select coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(estado->'pesos') x order by x->>'data' desc limit 20) y), '[]'::jsonb)
              from public.perfis where user_id = paciente and jsonb_typeof(estado->'pesos') = 'array'),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('data', d.data, 'registros', d.registros, 'agua', d.agua) order by d.data desc), '[]'::jsonb)
             from public.dias d where d.user_id = paciente and d.data between de and ate));
end $$;
