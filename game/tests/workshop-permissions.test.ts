import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,type ViteDevServer} from 'vite';
import {createGame} from '../src/engine';
import {seasonBookendScenarios} from '../src/content/seasonBookends';

let server:ViteDevServer,Workshop:typeof import('../src/components/Workshop')['default'];
before(async()=>{
  server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',logLevel:'error'});
  Workshop=(await server.ssrLoadModule('/src/components/Workshop.tsx')).default;
});
after(async()=>{await server?.close();});

test('returning to the introductory workshop exposes inherited per-tool restrictions',()=>{
  const scenario=seasonBookendScenarios[0],state=createGame(scenario);
  const initialBuild={tools:['observe','operate','verify'] as const,feedback:true,verification:true,budget:16,permissions:['*'],toolPermissions:{operate:[],verify:[]}};
  const build={...initialBuild,tools:[...initialBuild.tools]};
  const before=JSON.stringify(build);
  const html=renderToStaticMarkup(createElement(Workshop,{state,scenario,initialBuild:build,onApply:()=>{throw Error('Rendering must not configure a game');}}));
  assert.match(html,/逐件法器权限/);
  assert.match(html,/aria-label="塑形之手访问：/);
  assert.match(html,/aria-label="求真之印访问：/);
  assert.equal((html.match(/<fieldset/g)??[]).length,3);
  assert.equal(JSON.stringify(build),before);
  assert.equal(state.processedActionIds.length,0);
});

test('a new introductory build keeps the first interaction free of advanced permission controls',()=>{
  const scenario=seasonBookendScenarios[0],state=createGame(scenario);
  const html=renderToStaticMarkup(createElement(Workshop,{state,scenario,onApply:()=>{}}));
  assert.doesNotMatch(html,/逐件法器权限/);
  assert.match(html,/观测之镜/);
});
