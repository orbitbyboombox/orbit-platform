begin;

update public.cost_master_entries set amount=261000,quantity=1400,approval_reason='RC-16 · regla oficial BOOMBOX',updated_at=now()
where code='PAPER_BOX_COST';
update public.cost_master_entries set amount=261000.0/1400,approval_reason='RC-16 · recalculado desde caja de papel',updated_at=now()
where code='COST_PER_PHOTO';
update public.cost_master_entries set amount=7000,approval_reason='RC-16 · regla oficial BOOMBOX',updated_at=now()
where code in('ASSEMBLY','DISASSEMBLY');
update public.cost_master_entries set amount=15000,approval_reason='RC-16 · regla oficial BOOMBOX',updated_at=now()
where code='ASSEMBLY_DISASSEMBLY';
update public.cost_master_entries set amount=20000,approval_reason='RC-16 · regla oficial BOOMBOX',updated_at=now()
where code='DEFAULT_FUEL_COST';

insert into public.cost_master_entries(category,code,label,amount,quantity,unit,display_order,metadata,approval_reason)
values
('OTHER','SCRAPBOOK_COST','Costo Scrapbook',6000,1,'CLP/EVENTO',300,'{}','RC-16 · regla oficial BOOMBOX'),
('OTHER','MAGNETS_PURCHASE','Compra de imanes',300000,50,'CLP/50 EVENTOS',310,'{"estimatedCostPerEvent":6000}','RC-16 · regla oficial BOOMBOX'),
('OTHER','MAGNETS_EVENT_COST','Costo estimado de imanes por evento',6000,1,'CLP/EVENTO',320,'{"calculatedFrom":"MAGNETS_PURCHASE"}','RC-16 · regla oficial BOOMBOX'),
('OTHER','PENCILS_COST','Lápices',3500,2,'CLP/2 MESES',330,'{}','RC-16 · regla oficial BOOMBOX'),
('OTHER','DOUBLE_SIDED_TAPE_COST','Cinta doble contacto',2000,3,'CLP/3 MESES',340,'{}','RC-16 · regla oficial BOOMBOX')
on conflict(code) do update set amount=excluded.amount,quantity=excluded.quantity,unit=excluded.unit,metadata=excluded.metadata,enabled=true,deleted_at=null,approval_reason=excluded.approval_reason,updated_at=now();

update public.master_data_entries set configuration=jsonb_set(configuration,'{additionalHourPrice}','115000'::jsonb,true),updated_at=now()
where domain='SERVICES' and code='CLASSIC';
update public.master_data_entries set configuration=jsonb_set(configuration,'{additionalHourPrice}','145000'::jsonb,true),updated_at=now()
where domain='SERVICES' and code='POLAROID';
update public.master_data_entries set configuration=jsonb_set(configuration,'{additionalHourPrice}','150000'::jsonb,true),updated_at=now()
where domain='SERVICES' and code='BLACK_STUDIO';

update public.master_data_entries set configuration=jsonb_set(jsonb_set(configuration,'{estimatedPhotosPerHour}','60'::jsonb,true),'{paperConsumption}',to_jsonb(1.0),true),updated_at=now() where domain='SERVICES' and code='CLASSIC';
update public.master_data_entries set configuration=jsonb_set(jsonb_set(configuration,'{estimatedPhotosPerHour}','70'::jsonb,true),'{paperConsumption}',to_jsonb(1.0),true),updated_at=now() where domain='SERVICES' and code='POLAROID';
update public.master_data_entries set configuration=jsonb_set(jsonb_set(configuration,'{estimatedPhotosPerHour}','100'::jsonb,true),'{paperConsumption}',to_jsonb(1.0),true),updated_at=now() where domain='SERVICES' and code='BLACK_STUDIO';

update public.commercial_prices set rules=jsonb_set(coalesce(rules,'{}'::jsonb),'{additionalHourPrice}','115000'::jsonb,true),updated_at=now()
where category='SERVICE' and code='CLASSIC' and deleted_at is null;
update public.commercial_prices set rules=jsonb_set(coalesce(rules,'{}'::jsonb),'{additionalHourPrice}','145000'::jsonb,true),updated_at=now()
where category='SERVICE' and code='POLAROID' and deleted_at is null;
update public.commercial_prices set rules=jsonb_set(coalesce(rules,'{}'::jsonb),'{additionalHourPrice}','150000'::jsonb,true),updated_at=now()
where category='SERVICE' and code='BLACK_STUDIO' and deleted_at is null;

commit;
