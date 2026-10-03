import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, reduceGame, validateGameState} from '../src/engine';
import * as frozenV2 from '../src/engine/v2';
import type {ScenarioDefinition} from '../src/engine/types';
import {scenarios} from '../src/content/scenarios';
import {prologueIds} from '../src/content/seasonBookends';

const official = () => structuredClone(scenarios.find(source => source.id === prologueIds[0])!);

test('changing a blueprint property from non-enumerable to enumerable cannot borrow a positive plain-value result', () => {
  const source = official(), game = createGame(source, 714);
  Object.defineProperty(game.blueprint, 'reviewExtra', {value: 1, enumerable: false, writable: true, configurable: true});
  assert.equal(frozenV2.validateGameState(source, game), true);
  assert.equal(validateGameState(source, game), true);
  Object.defineProperty(game.blueprint, 'reviewExtra', {value: 1, enumerable: true, writable: true, configurable: true});
  assert.equal(frozenV2.validateGameState(source, game), false, 'the frozen validator rejects the newly visible unknown setting');
  assert.equal(validateGameState(source, game), frozenV2.validateGameState(source, game));
});

test('real automatic prerequisite order remains part of replay validity when the same object values are reordered', () => {
  const source: ScenarioDefinition = {
    id: 'memo-order-security-review', engineVersion: 2, version: 1, title: '依赖顺序', subtitle: '校验回归',
    brief: '完成两个真实前置', npc: '回声', chapter: 1, location: 'warehouse', kind: 'guided', concepts: ['loop'],
    initialWorld: {a: false, b: false, done: false},
    observations: [{id: 'look', target: 'device', label: '观察', facts: ['done'], text: '读取终点状态'}],
    operations: [
      {id: 'finish', target: 'device', label: '完成', requires: {a: true, b: true}, effects: {done: true}, successText: '完成', failureText: '前置未就绪'},
      {id: 'fix-a', target: 'a', label: '修复甲', effects: {a: true}, successText: '甲完成', failureText: '甲失败'},
      {id: 'fix-b', target: 'b', label: '修复乙', effects: {b: true}, successText: '乙完成', failureText: '乙失败'},
    ],
    goals: [{fact: 'done', equals: true, label: '真正完成', operationId: 'finish'}],
  };
  let game = createGame(source, 715);
  game = reduceGame(source, game, {id: 'build', type: 'configure', blueprint: {
    tools: ['observe', 'operate', 'verify'], feedback: true, verification: true, budget: 20, permissions: ['*'],
  }});
  game = reduceGame(source, game, {id: 'go', type: 'dispatch'});
  for (let step = 0; game.status === 'running' && step < 20; step++) game = reduceGame(source, game, {id: `step-${step}`, type: 'step'});
  assert.equal(game.status, 'won');
  const operations = game.events.filter(event => event.type === 'request' && event.operationId).map(event => event.operationId);
  assert.ok(operations.indexOf('fix-a') < operations.indexOf('fix-b'));
  assert.equal(frozenV2.validateGameState(source, game), true);
  assert.equal(validateGameState(source, game), true);
  source.operations[0].requires = {b: true, a: true};
  assert.equal(frozenV2.validateGameState(source, game), false, 'the changed authored order produces a different real step replay');
  assert.equal(validateGameState(source, game), frozenV2.validateGameState(source, game));
});

test('an inherited optional setting added after warming cannot change real validation while keeping the old cached result', () => {
  const source = official(), game = createGame(source, 716);
  assert.equal(frozenV2.validateGameState(source, game), true);
  assert.equal(validateGameState(source, game), true);
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'goalOrder');
  try {
    Object.defineProperty(Object.prototype, 'goalOrder', {value: ['absent'], configurable: true, writable: true, enumerable: false});
    assert.equal(frozenV2.validateGameState(source, game), false, 'the original validator observes the inherited invalid goal order');
    assert.equal(validateGameState(source, game), frozenV2.validateGameState(source, game));
  } finally {
    if (prior) Object.defineProperty(Object.prototype, 'goalOrder', prior);
    else Reflect.deleteProperty(Object.prototype, 'goalOrder');
  }
  assert.equal(validateGameState(source, game), true, 'restoring the prototype restores the original valid semantics');
});

test('a Proxy hidden in a non-enumerable scenario field cannot borrow a cloneable plain-field result', () => {
  const source = official();
  Object.defineProperty(source, 'operations', {value: source.operations, enumerable: false, writable: true, configurable: true});
  const game = createGame(source, 717);
  assert.equal(frozenV2.validateGameState(source, game), true);
  assert.equal(validateGameState(source, game), true);
  source.operations = new Proxy(source.operations, {get(target, key, receiver) {
    if (key === '0') return {...target[0], effects: {curtainOpen: false}};
    return Reflect.get(target, key, receiver);
  }});
  // structuredClone skips this non-enumerable field, so a whole-argument clone
  // succeeds despite the hidden Proxy. Cache eligibility must account for this.
  assert.doesNotThrow(() => structuredClone([source, game]));
  assert.equal(frozenV2.validateGameState(source, game), false);
  assert.equal(validateGameState(source, game), frozenV2.validateGameState(source, game));
});
