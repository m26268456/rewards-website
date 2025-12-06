import { PoolClient } from 'pg';
import { pool } from '../config/database';

const SHARED_TABLE = 'shared_reward_group_members';

const execute = (client?: PoolClient) => (client ? client.query.bind(client) : pool.query.bind(pool));

const columnExists = async (table: string, column: string): Promise<boolean> => {
  const { rows } = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists
  `,
    [table, column]
  );
  return rows[0]?.exists === true;
};

export const ensureSharedRewardMappingInfrastructure = async (): Promise<void> => {
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ${SHARED_TABLE} (
      scheme_id UUID PRIMARY KEY REFERENCES card_schemes(id) ON DELETE CASCADE,
      root_scheme_id UUID NOT NULL REFERENCES card_schemes(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  );

  await pool.query(
    `
    CREATE INDEX IF NOT EXISTS idx_${SHARED_TABLE}_root
    ON ${SHARED_TABLE}(root_scheme_id)
  `
  );

  // 將舊欄位資料遷移到新結構
  const legacyColumnExists = await columnExists('card_schemes', 'shared_reward_group_id');
  if (legacyColumnExists) {
    await pool.query(
      `
      INSERT INTO ${SHARED_TABLE} (scheme_id, root_scheme_id)
      SELECT id, shared_reward_group_id
      FROM card_schemes
      WHERE shared_reward_group_id IS NOT NULL
      ON CONFLICT (scheme_id) DO UPDATE
      SET root_scheme_id = EXCLUDED.root_scheme_id,
          updated_at = NOW()
    `
    );
  }
};

export const setSharedRewardGroupMapping = async (
  schemeId: string,
  rootSchemeId: string | null,
  client?: PoolClient
): Promise<void> => {
  const query = execute(client);

  if (!rootSchemeId || schemeId === rootSchemeId) {
    await query(
      `DELETE FROM ${SHARED_TABLE} WHERE scheme_id = $1`,
      [schemeId]
    );
    return;
  }

  await query(
    `
    INSERT INTO ${SHARED_TABLE} (scheme_id, root_scheme_id, created_at, updated_at)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (scheme_id) DO UPDATE
    SET root_scheme_id = EXCLUDED.root_scheme_id,
        updated_at = NOW()
  `,
    [schemeId, rootSchemeId]
  );
};

export const resolveSharedRewardTargetSchemeId = async (
  schemeId: string,
  client?: PoolClient
): Promise<string> => {
  const query = execute(client);
  const { rows } = await query(
    `SELECT root_scheme_id FROM ${SHARED_TABLE} WHERE scheme_id = $1`,
    [schemeId]
  );
  return rows[0]?.root_scheme_id || schemeId;
};

export const fetchSharedRewardMap = async (
  schemeIds: string[],
  client?: PoolClient
): Promise<Map<string, string>> => {
  const query = execute(client);
  const map = new Map<string, string>();
  if (schemeIds.length === 0) return map;

  const { rows } = await query(
    `
    SELECT scheme_id, root_scheme_id
    FROM ${SHARED_TABLE}
    WHERE scheme_id = ANY($1::uuid[])
  `,
    [schemeIds]
  );

  rows.forEach((row) => {
    if (row.root_scheme_id) {
      map.set(row.scheme_id, row.root_scheme_id);
    }
  });

  return map;
};

