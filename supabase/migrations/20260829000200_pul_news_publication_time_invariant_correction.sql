create function private.enforce_news_article_publication_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status = 'published'
     and new.published_at > pg_catalog.now() then
    raise exception '공개 뉴스의 게시 일시는 현재 이하여야 합니다.';
  end if;
  return new;
end;
$$;

comment on function private.enforce_news_article_publication_time() is
  'Prevents published news from becoming an implicit scheduled publication through a future published_at update.';

revoke all on function private.enforce_news_article_publication_time()
  from public, anon, authenticated, service_role;

create trigger news_articles_enforce_publication_time
before insert or update of publication_status, published_at
on public.news_articles
for each row execute function private.enforce_news_article_publication_time();
