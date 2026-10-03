import test from 'node:test';
import assert from 'node:assert/strict';
import {contentBundle,validateContent} from '../scripts/validate-content';
import type {ScenarioDefinition} from '../src/engine/types';
const reject=(scenarioId:string,mutate:(s:ScenarioDefinition)=>void,field?:string)=>{const copy=structuredClone(contentBundle),s=copy.scenarios.find(s=>s.id===scenarioId)!;mutate(s);const report=validateContent(copy);assert.ok(report.errors.length>0);if(field)assert.ok(report.errors.some(e=>e.includes(field)),report.errors.slice(0,4).join('\n'));};
test('blueprint production schema rejects unknown nested provider, role, source, step, module and startup fields',()=>{
 const cases:Array<[string,(s:ScenarioDefinition)=>void]>=[
 ['bp-opencode-separation',s=>Object.assign(s.blueprintLab!.providers![0],{hiddenOverride:true})],
 ['bp-opencode-separation',s=>Object.assign(s.blueprintLab!.providers![0].models[0],{hiddenOverride:true})],
 ['bp-opencode-separation',s=>Object.assign(s.blueprintLab!.roles![0],{hiddenOverride:true})],
 ['bp-opencode-separation',s=>Object.assign(s.blueprintLab!.roles![0].rules[0],{hiddenOverride:true})],
 ['bp-openclaw-routing',s=>Object.assign(s.blueprintLab!.messages![0].source,{hiddenOverride:true})],
 ['bp-openclaw-routing',s=>Object.assign(s.blueprintLab!.messages![0].steps[0],{hiddenOverride:true})],
 ['bp-dsh-composition',s=>Object.assign(s.blueprintLab!.modules![0],{hiddenOverride:true})],
 ['bp-dsh-composition',s=>Object.assign(s.blueprintLab!.initial!,{hiddenOverride:true})],
 ['bp-pi-extension',s=>Object.assign(s.operations[0].lab!,{hiddenOverride:true})],
 ['bp-hermes-stale',s=>Object.assign(s.transferRequirement!.lab!,{hiddenOverride:true})],
 ];for(const [id,change]of cases)reject(id,change,'hiddenOverride');
});
test('blueprint production gate checks semantic references and incompatible inherited mechanisms',()=>{
 reject('bp-pi-extension',s=>s.operations[0].lab!.moduleId='undeclared-extension');
 reject('bp-openclaw-routing',s=>delete (s.blueprintLab!.messages![0].source as {peerId?:string}).peerId);
 reject('bp-dsh-composition',s=>s.blueprintLab!.modules![0].requires=['unknown-dependency']);
 reject('bp-hermes-stale',s=>s.transferRequirement!.lab={snapshotReload:false});
 reject('bp-opencode-separation',s=>s.engineVersion=7);
 reject('bp-hermes-stale',s=>s.transferRequirement!.evaluation={certified:true});
});
