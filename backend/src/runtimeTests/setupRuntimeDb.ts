import resetSql from '../../d1/reset.sql?raw';
import initSql from '../../d1/init.sql?raw';

function splitSql(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function resetRuntimeDb(db: D1Database): Promise<void> {
  for (const statement of [...splitSql(resetSql), ...splitSql(initSql)]) {
    await db.prepare(statement).run();
  }
}
