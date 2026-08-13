# Document Architecture

Cotizaciones, contratos, comprobantes, documentos CRM, onboarding y Academy guardan metadata en PostgreSQL y archivos en buckets Supabase privados. Google Drive puede contener la estructura documental del evento. Las rutas de descarga verifican autorización y no publican rutas internas.

El contrato PDF incluye valores aplicados y datos bancarios oficiales. Los documentos comerciales solo aparecen en Portal Staff si el Founder los clasificó expresamente como operacionales. Sustituciones conservan auditoría y checksum cuando aplica.
