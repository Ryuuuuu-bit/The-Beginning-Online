import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadGameData } from '@the-beginning-online/shared';
import { PostgresStore } from '../store/postgres.js';
import {readFileSync} from 'node:fs';

test('restart-safe ledger migrations retain both SQL dollar-quote delimiters',()=>{
 for(const file of ['018_trade.sql','024_level_rewards.sql']){
  const sql=readFileSync(new URL('../../sql/'+file,import.meta.url),'utf8');
  assert.ok(sql.includes('DO $$BEGIN'),file);
  assert.equal(sql.split('$$').length-1,2,file+' must close its DO block');
 }
});

test('Postgres restart preserves trade ledger and its validated, append-only constraints',
  { skip: !process.env.PG_TEST_URL && 'PG_TEST_URL not set' }, async () => {
    let store = new PostgresStore(process.env.PG_TEST_URL!);
    try {
      await store.init();
      const profile = loadGameData().stats.defaultBuild;
      const a = await store.createGuest(randomUUID()), b = await store.createGuest(randomUUID());
      const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
      const first = await store.createCharacter(a.id, 'CfA' + suffix, ('CfA' + suffix).toLowerCase());
      const second = await store.createCharacter(b.id, 'CfB' + suffix, ('CfB' + suffix).toLowerCase());
      await store.inventoryOp(a.id, first.id, randomUUID(), { op: 'admin', loot: [], gold: 20 }, { profile });
      const result = await store.trade(
        { accountId: a.id, id: first.id, offer: { items: [], gold: 7 }, profile },
        { accountId: b.id, id: second.id, offer: { items: [], gold: 0 }, profile },
        { tradeId: randomUUID() }
      );
      assert.equal(result.error, undefined);
      const rows = async () => (await store.pool.query('SELECT id,kind,gold_delta FROM tn2_ledger WHERE character_id=ANY($1::uuid[]) ORDER BY id', [[first.id, second.id]])).rows;
      const before = await rows();
      assert.ok(before.some(row => row.kind === 'trade_in'));
      assert.ok(before.some(row => row.kind === 'trade_out'));
      await store.close();
      store = new PostgresStore(process.env.PG_TEST_URL!);
      await store.init();
      await store.init();
      assert.deepEqual(await rows(), before);
      assert.equal((await store.character(a.id, first.id))!.gold, 13);
      assert.equal((await store.character(b.id, second.id))!.gold, 7);
      assert.equal((await store.pool.query("SELECT convalidated FROM pg_constraint WHERE conrelid='tn2_ledger'::regclass AND conname='tn2_ledger_kind_check'")).rows[0].convalidated, true);
      await assert.rejects(store.pool.query("INSERT INTO tn2_ledger(kind,character_id,qty,gold_delta,request_id) VALUES('invalid',$1,0,0,$2)", [first.id, randomUUID()]), { code: '23514' });
      await assert.rejects(store.pool.query('UPDATE tn2_ledger SET qty=0 WHERE character_id=$1', [first.id]), /append-only/);
      assert.deepEqual(await rows(), before);
    } finally {
      await store.close();
    }
  });
