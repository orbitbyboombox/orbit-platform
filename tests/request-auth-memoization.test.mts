import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';

// Exercise the actual module with React's RSC cache. Only the framework request
// dispatcher and external services are fixtures; no real auth/database calls occur.
test('RSC auth deduplicates within a request, isolates concurrent users, and keeps actions fresh',async()=>{
 const internals=(React as any).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
 assert.ok(internals,'Run this test with --conditions=react-server');
 const context=new AsyncLocalStorage<{cache:Map<unknown,unknown>;user:string;clients:number;checks:number;fail?:boolean}>();
 const previous=internals.A;
 internals.A={getCacheForType:(factory:()=>unknown)=>{const request=context.getStore()!;if(!request.cache.has(factory))request.cache.set(factory,factory());return request.cache.get(factory)}};
 try{
  const code=ts.transpileModule(readFileSync('lib/supabase/server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox=vm.createContext({process:{env:{SUPABASE_URL:'https://qa.invalid',SUPABASE_PUBLISHABLE_KEY:'qa',NODE_ENV:'test'}}});
  const fakeClient=()=>{const request=context.getStore()!;request.clients++;return {auth:{async getUser(){request.checks++;await Promise.resolve();if(request.fail)throw new Error('Auth unavailable');return {data:{user:{id:request.user}},error:null}}}}};
  const fixtures:Record<string,Record<string,unknown>>={react:{cache:React.cache},'@supabase/ssr':{createServerClient:fakeClient},'next/headers':{cookies:async()=>({getAll:()=>[],set:()=>{}})},'./environment-guard':{assertSupabaseEnvironmentSafe:()=>{},isReadOnlyVisualPreview:()=>false},'./read-only-preview':{makeReadOnlyVisualPreviewClient:(c:unknown)=>c}};
  const mod=new vm.SourceTextModule(code,{context:sandbox});
  await mod.link(async name=>{const exports=fixtures[name];assert.ok(exports,`Unexpected external dependency ${name}`);return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context:sandbox})});await mod.evaluate();
  const api=mod.namespace as any;
  const run=(user:string)=>{const request={cache:new Map(),user,clients:0,checks:0};return context.run(request,async()=>{const [layout,page]=await Promise.all([api.createSupabaseServerClient(),api.createSupabaseServerClient()]);assert.equal(layout,page);const identities=await Promise.all([layout.auth.getUser(),page.auth.getUser(),page.auth.getUser()]);assert.ok(identities.every(x=>x.data.user.id===user));assert.equal(request.clients,1);assert.equal(request.checks,1);return request})};
  const [a,b]=await Promise.all([run('founder-a'),run('founder-b')]);assert.notEqual(a.cache,b.cache);
  const request={cache:new Map(),user:'action-user',clients:0,checks:0};await context.run(request,async()=>{const a=await api.createSupabaseServerActionClient(),b=await api.createSupabaseServerActionClient();assert.notEqual(a,b);await a.auth.getUser();await b.auth.getUser();assert.equal(request.clients,2);assert.equal(request.checks,2)});
  await context.run({cache:new Map(),user:'denied',clients:0,checks:0,fail:true},async()=>{const client=await api.createSupabaseServerClient();await assert.rejects(()=>client.auth.getUser(),/Auth unavailable/)});
 }finally{internals.A=previous;}
});
