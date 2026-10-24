import test from 'node:test';
import assert from 'node:assert/strict';
import {readGuideProgress} from '../src/guide-progress.ts';

test('guide progress preserves existing characters and safely handles damaged storage',()=>{
 assert.deepEqual(readGuideProgress('{"step":8,"off":true,"min":true}',13),{step:8,off:true,min:true});
 assert.deepEqual(readGuideProgress('{"step":999,"off":"false"}',13),{step:13,off:false,min:false});
 assert.equal(readGuideProgress('{',13),null);
 assert.equal(readGuideProgress(null,13),null);
 for(const step of [-2,1.5,'8',null])assert.equal(readGuideProgress(JSON.stringify({step}),13).step,0);
});
