import type { Db } from '../db';
import { q } from '../db';

export async function audit(
  db: Db,
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  oldData: unknown = null,
  newData: unknown = null,
) {
  await q(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_data, new_data) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, action, entity, entityId, oldData === null ? null : JSON.stringify(oldData), newData === null ? null : JSON.stringify(newData)],
    db,
  );
}
