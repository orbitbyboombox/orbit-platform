-- Persistent Founder-controlled commune -> sector catalog.
-- Reuses the canonical master-data center; no event rows are duplicated.
alter table public.master_data_entries
  drop constraint if exists master_data_entries_domain_check;

alter table public.master_data_entries
  add constraint master_data_entries_domain_check check (domain in (
    'SERVICES', 'EVENT_TYPES', 'PAYROLL', 'COMPANY', 'DOCUMENT_TEMPLATES',
    'SYSTEM_PARAMETERS', 'LOGISTICS_COMMUNE_SECTOR'
  ));

insert into public.master_data_entries (domain, code, label, display_order, configuration)
values
 ('LOGISTICS_COMMUNE_SECTOR','alhue','Alhué',1,'{"communeNormalized":"alhue","province":"Melipilla","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','buin','Buin',2,'{"communeNormalized":"buin","province":"Maipo","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','calera de tango','Calera de Tango',3,'{"communeNormalized":"calera de tango","province":"Maipo","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','cerrillos','Cerrillos',4,'{"communeNormalized":"cerrillos","province":"Santiago","region":"REGION_METROPOLITANA","sector":"PONIENTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','cerro navia','Cerro Navia',5,'{"communeNormalized":"cerro navia","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','colina','Colina',6,'{"communeNormalized":"colina","province":"Chacabuco","region":"REGION_METROPOLITANA","sector":"NORTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','conchali','Conchalí',7,'{"communeNormalized":"conchali","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','curacavi','Curacaví',8,'{"communeNormalized":"curacavi","province":"Melipilla","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','el bosque','El Bosque',9,'{"communeNormalized":"el bosque","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','el monte','El Monte',10,'{"communeNormalized":"el monte","province":"Talagante","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','estacion central','Estación Central',11,'{"communeNormalized":"estacion central","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','huechuraba','Huechuraba',12,'{"communeNormalized":"huechuraba","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','independencia','Independencia',13,'{"communeNormalized":"independencia","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','isla de maipo','Isla de Maipo',14,'{"communeNormalized":"isla de maipo","province":"Talagante","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','la cisterna','La Cisterna',15,'{"communeNormalized":"la cisterna","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','la florida','La Florida',16,'{"communeNormalized":"la florida","province":"Santiago","region":"REGION_METROPOLITANA","sector":"SUR"}'),
 ('LOGISTICS_COMMUNE_SECTOR','la granja','La Granja',17,'{"communeNormalized":"la granja","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','la pintana','La Pintana',18,'{"communeNormalized":"la pintana","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','la reina','La Reina',19,'{"communeNormalized":"la reina","province":"Santiago","region":"REGION_METROPOLITANA","sector":"ORIENTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','lampa','Lampa',20,'{"communeNormalized":"lampa","province":"Chacabuco","region":"REGION_METROPOLITANA","sector":"NORTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','las condes','Las Condes',21,'{"communeNormalized":"las condes","province":"Santiago","region":"REGION_METROPOLITANA","sector":"ORIENTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','lo barnechea','Lo Barnechea',22,'{"communeNormalized":"lo barnechea","province":"Santiago","region":"REGION_METROPOLITANA","sector":"ORIENTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','lo espejo','Lo Espejo',23,'{"communeNormalized":"lo espejo","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','lo prado','Lo Prado',24,'{"communeNormalized":"lo prado","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','macul','Macul',25,'{"communeNormalized":"macul","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','maipu','Maipú',26,'{"communeNormalized":"maipu","province":"Santiago","region":"REGION_METROPOLITANA","sector":"PONIENTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','maria pinto','María Pinto',27,'{"communeNormalized":"maria pinto","province":"Melipilla","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','melipilla','Melipilla',28,'{"communeNormalized":"melipilla","province":"Melipilla","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','nunoa','Ñuñoa',29,'{"communeNormalized":"nunoa","province":"Santiago","region":"REGION_METROPOLITANA","sector":"CENTRO"}'),
 ('LOGISTICS_COMMUNE_SECTOR','padre hurtado','Padre Hurtado',30,'{"communeNormalized":"padre hurtado","province":"Talagante","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','paine','Paine',31,'{"communeNormalized":"paine","province":"Maipo","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','pedro aguirre cerda','Pedro Aguirre Cerda',32,'{"communeNormalized":"pedro aguirre cerda","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','penaflor','Peñaflor',33,'{"communeNormalized":"penaflor","province":"Talagante","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','penalolen','Peñalolén',34,'{"communeNormalized":"penalolen","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','pirque','Pirque',35,'{"communeNormalized":"pirque","province":"Cordillera","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','providencia','Providencia',36,'{"communeNormalized":"providencia","province":"Santiago","region":"REGION_METROPOLITANA","sector":"CENTRO"}'),
 ('LOGISTICS_COMMUNE_SECTOR','pudahuel','Pudahuel',37,'{"communeNormalized":"pudahuel","province":"Santiago","region":"REGION_METROPOLITANA","sector":"PONIENTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','puente alto','Puente Alto',38,'{"communeNormalized":"puente alto","province":"Cordillera","region":"REGION_METROPOLITANA","sector":"SUR"}'),
 ('LOGISTICS_COMMUNE_SECTOR','quilicura','Quilicura',39,'{"communeNormalized":"quilicura","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','quinta normal','Quinta Normal',40,'{"communeNormalized":"quinta normal","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','recoleta','Recoleta',41,'{"communeNormalized":"recoleta","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','renca','Renca',42,'{"communeNormalized":"renca","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','san bernardo','San Bernardo',43,'{"communeNormalized":"san bernardo","province":"Maipo","region":"REGION_METROPOLITANA","sector":"SUR"}'),
 ('LOGISTICS_COMMUNE_SECTOR','san joaquin','San Joaquín',44,'{"communeNormalized":"san joaquin","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','san jose de maipo','San José de Maipo',45,'{"communeNormalized":"san jose de maipo","province":"Cordillera","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','san miguel','San Miguel',46,'{"communeNormalized":"san miguel","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','san pedro','San Pedro',47,'{"communeNormalized":"san pedro","province":"Melipilla","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','san ramon','San Ramón',48,'{"communeNormalized":"san ramon","province":"Santiago","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','santiago','Santiago',49,'{"communeNormalized":"santiago","province":"Santiago","region":"REGION_METROPOLITANA","sector":"CENTRO"}'),
 ('LOGISTICS_COMMUNE_SECTOR','talagante','Talagante',50,'{"communeNormalized":"talagante","province":"Talagante","region":"REGION_METROPOLITANA","sector":"OTROS"}'),
 ('LOGISTICS_COMMUNE_SECTOR','tiltil','Tiltil',51,'{"communeNormalized":"tiltil","province":"Chacabuco","region":"REGION_METROPOLITANA","sector":"NORTE"}'),
 ('LOGISTICS_COMMUNE_SECTOR','vitacura','Vitacura',52,'{"communeNormalized":"vitacura","province":"Santiago","region":"REGION_METROPOLITANA","sector":"ORIENTE"}')
on conflict (domain, code) do nothing;

