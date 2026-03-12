CREATE SEQUENCE IF NOT EXISTS dd_document_categories_id_seq OWNED BY dd_document_categories.id;
SELECT setval('dd_document_categories_id_seq', COALESCE((SELECT MAX(id) FROM dd_document_categories), 0));
ALTER TABLE dd_document_categories ALTER COLUMN id SET DEFAULT nextval('dd_document_categories_id_seq');