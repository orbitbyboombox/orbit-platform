begin;

update public.commercial_prices
set rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{municipalities}', case code
  when 'SANTIAGO_PROVINCE' then '["Santiago","Cerrillos","Cerro Navia","Conchalí","El Bosque","Estación Central","Huechuraba","Independencia","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","Ñuñoa","Pedro Aguirre Cerda","Peñalolén","Providencia","Pudahuel","Quilicura","Quinta Normal","Recoleta","Renca","San Joaquín","San Miguel","San Ramón","Vitacura"]'::jsonb
  when 'CHACABUCO' then '["Colina","Lampa","Tiltil"]'::jsonb
  when 'CORDILLERA' then '["Puente Alto","Pirque","San José de Maipo"]'::jsonb
  when 'MAIPO' then '["San Bernardo","Buin","Calera de Tango","Paine"]'::jsonb
  when 'MELIPILLA' then '["Melipilla","Alhué","Curacaví","María Pinto","San Pedro"]'::jsonb
  when 'TALAGANTE' then '["Talagante","El Monte","Isla de Maipo","Padre Hurtado","Peñaflor"]'::jsonb
  else coalesce(rules->'municipalities', '[]'::jsonb)
end, true),
approval_reason = 'EPIC 05 STORY 03: municipios trasladados a Master Data'
where category = 'TRANSPORT' and deleted_at is null and not (coalesce(rules, '{}'::jsonb) ? 'municipalities');

commit;
