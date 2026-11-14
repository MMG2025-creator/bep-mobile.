"use strict";

const ALLOWED_TABLES = new Set([
  "public.bep_financial_knowledge",
  "public.bep_agent_approved_knowledge"
]);

const PREFLIGHT_SQL = `
WITH current_identity AS (
  SELECT current_user AS role_name, current_database() AS database_name
),
role_flags AS (
  SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
         r.rolreplication, r.rolbypassrls
  FROM pg_roles r
  WHERE r.rolname = current_user
     OR pg_has_role(current_user, r.oid, 'MEMBER')
),
relation_privileges AS (
  SELECT n.nspname || '.' || c.relname AS relation_name,
         has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
         has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
         has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
         has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete,
         has_table_privilege(current_user, c.oid, 'TRUNCATE') AS can_truncate,
         has_table_privilege(current_user, c.oid, 'REFERENCES') AS can_reference,
         has_table_privilege(current_user, c.oid, 'TRIGGER') AS can_trigger,
         c.relkind AS relation_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
),
sequence_privileges AS (
  SELECT n.nspname || '.' || c.relname AS sequence_name,
         has_sequence_privilege(current_user, c.oid, 'USAGE')
         OR has_sequence_privilege(current_user, c.oid, 'SELECT')
         OR has_sequence_privilege(current_user, c.oid, 'UPDATE') AS has_access
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'S'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
schema_privileges AS (
  SELECT n.nspname,
         has_schema_privilege(current_user, n.oid, 'CREATE') AS can_create
  FROM pg_namespace n
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
)
SELECT
  (SELECT role_name FROM current_identity) AS role_name,
  (SELECT database_name FROM current_identity) AS database_name,
  COALESCE((SELECT bool_or(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM role_flags), false) AS elevated_role,
  has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
  COALESCE((SELECT json_agg(row_to_json(x)) FROM relation_privileges x), '[]'::json) AS relations,
  COALESCE((SELECT json_agg(row_to_json(x)) FROM sequence_privileges x WHERE x.has_access), '[]'::json) AS accessible_sequences,
  COALESCE((SELECT json_agg(row_to_json(x)) FROM schema_privileges x WHERE x.can_create), '[]'::json) AS writable_schemas
`;

function assertReadOnlyExporterRole(result) {
  const row = result && result.rows && result.rows[0];
  if (!row) throw new Error("Database role preflight returned no identity data");
  if (row.elevated_role || row.database_create) {
    throw new Error("Exporter database role has elevated or unnecessary database privileges");
  }
  const relations = Array.isArray(row.relations) ? row.relations : JSON.parse(row.relations || "[]");
  const accessibleSequences = Array.isArray(row.accessible_sequences)
    ? row.accessible_sequences : JSON.parse(row.accessible_sequences || "[]");
  const writableSchemas = Array.isArray(row.writable_schemas)
    ? row.writable_schemas : JSON.parse(row.writable_schemas || "[]");

  for (const relation of relations) {
    const name = relation.relation_name;
    const hasAnyPrivilege = relation.can_select || relation.can_insert || relation.can_update ||
      relation.can_delete || relation.can_truncate || relation.can_reference || relation.can_trigger;
    if (!hasAnyPrivilege) continue;
    if (!ALLOWED_TABLES.has(name) || !relation.can_select ||
        relation.can_insert || relation.can_update || relation.can_delete ||
        relation.can_truncate || relation.can_reference || relation.can_trigger) {
      throw new Error("Exporter role has an unexpected relation privilege: " + name);
    }
  }

  if (accessibleSequences.length) {
    throw new Error("Exporter role has sequence privileges");
  }
  if (writableSchemas.length) {
    throw new Error("Exporter role can create objects in a schema");
  }
  const allowedFound = new Set(relations.filter(r => r.can_select).map(r => r.relation_name));
  for (const table of ALLOWED_TABLES) {
    if (!allowedFound.has(table)) throw new Error("Exporter role is missing SELECT on " + table);
  }
  return { role_name: row.role_name, database_name: row.database_name, allowed_tables: [...ALLOWED_TABLES] };
}

async function verifyReadOnlyExporterRole(client) {
  const result = await client.query(PREFLIGHT_SQL);
  return assertReadOnlyExporterRole(result);
}

module.exports = { PREFLIGHT_SQL, assertReadOnlyExporterRole, verifyReadOnlyExporterRole };
