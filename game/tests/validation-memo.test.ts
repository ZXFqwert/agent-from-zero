import test from 'node:test';
import assert from 'node:assert/strict';
import {memoizePositiveValidation} from '../src/engine/validationMemo';
import {createGame,reduceGame,validateGameState} from '../src/engine';
import {scenarios} from '../src/content/scenarios';
import {prologueIds} from '../src/content/seasonBookends';
import * as frozenV2 from '../src/engine/v2';

test('positive validation content hits survive cloning but every mutated value is rechecked',()=>{
  let calls=0;
  const validate=memoizePositiveValidation((value:{world:{power:boolean};actions:string[]})=>{calls++;return value.world.power&&value.actions[0]==='actual';});
  const value={world:{power:true},actions:['actual']};
  assert.equal(validate(value),true);assert.equal(validate(structuredClone(value)),true);assert.equal(calls,1);
  value.world.power=false;assert.equal(validate(value),false);assert.equal(calls,2);
  assert.equal(validate(value),false);assert.equal(calls,3);
  value.world.power=true;value.actions[0]='invented';assert.equal(validate(value),false);assert.equal(calls,4);
});
test('undefined fields, array holes, numeric signs and prototypes cannot borrow another value result',()=>{
  let calls=0;
  const validate=memoizePositiveValidation((_value:unknown)=>{calls++;return true;});
  for(const value of [{}, {extra:undefined}, [], Array(1), [undefined], 0, -0, Object.create(null)])assert.equal(validate(value),true);
  assert.equal(calls,8);
});
test('getters, symbols, cycles and proxies use the original validator rather than positive hits',()=>{
  let calls=0;
  const validate=memoizePositiveValidation((value:unknown)=>{calls++;try{structuredClone(value);return true;}catch{return false;}});
  const value={a:1};assert.equal(validate(value),true);
  assert.equal(validate(new Proxy(value,{})),false);assert.equal(calls,2);
  assert.equal(validate({get a(){return 1;}}),true);assert.equal(calls,3);
  const symbolValue={a:1,[Symbol('x')]:2};assert.equal(validate(symbolValue),true);assert.equal(calls,4);
  const cyclic:{self?:unknown}={};cyclic.self=cyclic;assert.equal(validate(cyclic),true);assert.equal(calls,5);
});
test('bounded results evict old entries and validator exceptions are never cached',()=>{
  let calls=0;
  const validate=memoizePositiveValidation((value:string)=>{calls++;if(value==='broken')throw new Error('real validation');return true;},150);
  assert.equal(validate('a'.repeat(25)),true);assert.equal(validate('b'.repeat(25)),true);assert.equal(validate('a'.repeat(25)),true);assert.equal(calls,3);
  assert.throws(()=>validate('broken'),/real validation/);assert.throws(()=>validate('broken'),/real validation/);assert.equal(calls,5);
});
test('actual warmed kernel validation still rejects modified world, log and source conditions',()=>{
  const source=scenarios.find(s=>s.id===prologueIds[0])!;
  let game=createGame(source);
  for(const action of [{id:'build',type:'configure',blueprint:{tools:['observe','operate','verify'],permissions:['*'],feedback:true,verification:true,budget:16}},{id:'go',type:'dispatch',mode:'manual'},{id:'act',type:'tool',call:{tool:'operate',operationId:'pull-workshop-curtain'}},{id:'check',type:'tool',call:{tool:'verify',fact:'curtainOpen'}}] as const)game=reduceGame(source,game,action as never);
  assert.equal(game.status,'won');assert.equal(validateGameState(source,game),true);assert.equal(validateGameState(source,structuredClone(game)),true);
  const changed=structuredClone(game);changed.world.curtainOpen=false;assert.equal(validateGameState(source,changed),false);
  const changedLog=structuredClone(game);changedLog.events.pop();assert.equal(validateGameState(source,changedLog),false);
  const changedSource=structuredClone(source);changedSource.operations[0].effects.curtainOpen=false;assert.equal(validateGameState(changedSource,game),false);
  const proxy=new Proxy(game,{});assert.equal(validateGameState(source,proxy),frozenV2.validateGameState(source,proxy));
});
