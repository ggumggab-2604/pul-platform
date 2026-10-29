-- Reuse the existing scorecard evidence type for an explicitly selected public document photo.
do $$declare definition text; old_fragment text:='case when p_input->>''purpose''=''private_score'' then ''scorecard'' else ''round_photo'' end';begin
 definition:=pg_get_functiondef('public.mutate_hall_special_record(text,uuid,jsonb)'::regprocedure);
 assert strpos(definition,old_fragment)>0;
 execute replace(definition,old_fragment,'case when p_input->>''purpose''=''private_score'' or (p_input->>''purpose''=''public_photo'' and p_input->>''media_kind''=''document'') then ''scorecard'' else ''round_photo'' end');
end$$;
