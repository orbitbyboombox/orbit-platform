import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const loader=read("components/ui/orbit-loader.tsx");
const css=read("app/globals.css");

test("one shared OrbitLoader provides inline, button, section and fullscreen variants",()=>{
  for(const variant of ["inline","button","section","fullscreen"])assert.match(loader,new RegExp(`variant===\\"${variant}\\"|${variant}:\\"size`));
  assert.match(loader,/orbit-loader-ring/);
  assert.match(loader,/aria-live="polite"/);
  assert.match(loader,/aria-busy="true"/);
  assert.match(css,/--brand: #F78900/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.doesNotMatch(loader,/setTimeout|setInterval/);
});

test("shared Button disables a real loading action and embeds the shared ring",()=>{
  const button=read("components/ui/button.tsx"),action=read("components/ui/action-button.tsx");
  assert.match(button,/loading\?: boolean/);
  assert.match(button,/disabled=\{loading \|\| props.disabled\}/);
  assert.match(button,/OrbitLoader variant="button"/);
  assert.match(action,/!props.loading/);
  assert.match(css,/button\[aria-busy="true"\]:not\(:has\(\.orbit-loader-ring\)\):not\(:has\(\.animate-spin\)\)::after/);
});

test("navigation uses real Next loading boundaries across platform and both portals",()=>{
  for(const path of ["app/loading.tsx","app/(platform)/loading.tsx","app/(platform)/projects/[projectId]/loading.tsx","app/staff-portal/loading.tsx","app/staff-portal/academy/loading.tsx","app/staff/login/loading.tsx","app/portal/login/loading.tsx","app/p/[token]/loading.tsx","app/booking/[token]/loading.tsx"]){
    assert.match(read(path),/OrbitLoader|PageSkeleton/,path);
  }
  assert.match(read("app/layout.tsx"),/Suspense fallback=\{<OrbitLoader/);
});

test("login and native receipt POST show actual pending without artificial timer",()=>{
  const admin=read("features/authentication/components/login-form.tsx");
  const staff=read("features/portal-authentication/portal-login-form.tsx");
  const receipt=read("features/customer-portal/customer-payment-experience.tsx");
  assert.match(admin,/loading=\{isPending\}/);
  assert.match(staff,/aria-busy=\{pending\} disabled=\{pending\}/);
  assert.match(receipt,/onSubmit=\{\(\)=>setSubmittingReceipt\(true\)\}/);
  assert.match(receipt,/loading=\{submittingReceipt\}/);
  for(const text of [admin,staff,receipt])assert.doesNotMatch(text,/setTimeout\(/);
});

test("major Staff, event, finance and customer actions annotate their real pending state",()=>{
  for(const path of ["features/portal-authentication/staff-portal-dashboard.tsx","features/staff-assignment-center/staff-assignment-center.tsx","features/accounts-receivable/event-payment-manager.tsx","features/crm/customer-event-operations.tsx","features/operations/event-logistics-center.tsx","features/customer-portal/customer-design-experience.tsx"]){
    assert.match(read(path),/aria-busy=\{pending\} disabled=\{pending\}/,path);
  }
});
