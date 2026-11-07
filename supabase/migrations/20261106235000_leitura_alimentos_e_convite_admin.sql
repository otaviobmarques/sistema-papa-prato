-- Leitura dos alimentos da equipe: visitantes só veem publicados; a equipe vê também rascunhos.
create policy "visitantes leem publicados" on public.alimentos_equipe for select to anon using (publicado);
create policy "usuarios leem publicados e equipe le tudo" on public.alimentos_equipe for select to authenticated using (publicado or (select public.eh_equipe()));

-- Convite do administrador inicial (recebe o papel ao criar a conta com este e-mail).
insert into public.convites_equipe (email, papel) values ('otaviobmarques@gmail.com', 'admin') on conflict do nothing;
