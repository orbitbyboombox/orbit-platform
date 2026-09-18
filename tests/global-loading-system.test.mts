import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const loader=read("components/ui/orbit-loader.tsx");
const css=read("app/globals.css");

test("one shared OrbitLoader provides inline, button, section and fullscreen variants",()=>{
  for(const variant of ["inline","button","section","fullscreen"])assert.match(loader,new RegExp(`variant===\\"${variant}\\"|${variant}:\\"size`));
  assert.match(loader,/orbit-loader-ring/);
  assert.match(loader,/size\?: "sm" \| "md" \| "lg"/);
  assert.match(loader,/aria-live="polite"/);
  assert.match(loader,/aria-busy="true"/);
  assert.match(css,/--brand: #F78900/);
  assert.match(css,/prefers-reduced-motion: reduce/);
  assert.doesNotMatch(loader,/setTimeout|setInterval/);
});

test("operational reservation, signing, reminder and collection rings use the same OrbitLoader",()=>{
  for(const path of ["features/automatic-booking/automatic-booking-experience.tsx","features/projects/components/new-project-drawer.tsx","features/projects/signing/agreement-signing-control.tsx","features/projects/communications/pre-event-reminder-control.tsx","features/projects/communications/digital-photo-delivery-control.tsx","features/accounts-receivable/collection-email-composer.tsx"]){
    const source=read(path);
    assert.match(source,/<OrbitLoader/,path);
    assert.doesNotMatch(source,/LoaderCircle|Loader2|animate-spin/,path);
  }
});

test("shared Button disables a real loading action and embeds the shared ring",()=>{
  const button=read("components/ui/button.tsx"),action=read("components/ui/action-button.tsx"),pendingSubmit=read("components/ui/pending-submit-button.tsx");
  assert.match(button,/loading\?: boolean/);
  assert.match(button,/const busy =/);
  assert.match(button,/disabled=\{busy \|\| props.disabled\}/);
  assert.match(button,/OrbitLoader variant="button"/);
  assert.match(action,/!props.loading/);
  assert.match(pendingSubmit,/useFormStatus/);
  assert.match(pendingSubmit,/disabled=\{disabled \|\| pending\}/);
  assert.match(pendingSubmit,/loading=\{pending\}/);
  assert.match(css,/button\[aria-busy="true"\]:not\(:has\(\.orbit-loader-ring\)\):not\(:has\(\.animate-spin\)\)::after/);
});

test("asChild loading keeps Radix Slot to one child",()=>{
  const button=read("components/ui/button.tsx");
  assert.match(button,/Children\.only\(children\)/);
  assert.match(button,/cloneElement\(element/);
  assert.match(button,/if \(asChild\)/);
});

test("navigation uses real Next loading boundaries across platform and both portals",()=>{
  for(const path of ["app/loading.tsx","app/(platform)/loading.tsx","app/(platform)/office-rent/loading.tsx","app/(platform)/projects/[projectId]/loading.tsx","app/staff-portal/loading.tsx","app/staff-portal/academy/loading.tsx","app/staff/login/loading.tsx","app/portal/login/loading.tsx","app/p/[token]/loading.tsx","app/booking/[token]/loading.tsx"]){
    assert.match(read(path),/OrbitLoader|PageSkeleton/,path);
  }
  assert.match(read("app/layout.tsx"),/Suspense fallback=\{<OrbitLoader/);
});

test("every required Founder area inherits the platform loading boundary",()=>{
  for(const path of ["app/(platform)/operations/page.tsx","app/(platform)/customers/page.tsx","app/(platform)/resources/staff/page.tsx","app/(platform)/events/page.tsx","app/(platform)/finance/page.tsx","app/(platform)/projects/page.tsx","app/(platform)/settings/page.tsx","app/(platform)/office-rent/page.tsx"]){
    assert.equal(existsSync(path),true,path);
  }
  assert.match(read("app/(platform)/loading.tsx"),/PageSkeleton/);
});

test("login and native receipt POST show actual pending without artificial timer",()=>{
  const admin=read("features/authentication/components/login-form.tsx");
  const staff=read("features/portal-authentication/portal-login-form.tsx");
  const receipt=read("features/customer-portal/customer-payment-experience.tsx");
  assert.match(admin,/loading=\{isPending\}/);
  assert.match(staff,/loading=\{pending\}/);
  assert.match(staff,/loadingLabel="Validando…"/);
  assert.match(receipt,/onSubmit=\{\(\)=>setSubmittingReceipt\(true\)\}/);
  assert.match(receipt,/loading=\{submittingReceipt\}/);
  for(const text of [admin,staff,receipt])assert.doesNotMatch(text,/setTimeout\(/);
});

test("automatic booking is tied to real pending state and never simulates server progress",()=>{
  const booking=read("features/automatic-booking/automatic-booking-experience.tsx");
  assert.match(booking,/if\s*\(pending\)\s*return <BookingProcessing/);
  assert.match(booking,/finally\s*\{\s*setPending\(false\)/);
  assert.match(booking,/receiptReading/);
  assert.match(booking,/Procesando comprobante…/);
  assert.doesNotMatch(booking,/progressIndex/);
  assert.match(booking,/createProcessingActivityTicker/);
});

test("server-action forms inherit pending state from the submitting form",()=>{
  for(const path of ["app/(platform)/certification/page.tsx","components/layout/header.tsx","features/portal-authentication/staff-portal.tsx","features/settings/components/connection-center.tsx"]){
    assert.match(read(path),/PendingSubmitButton/,path);
  }
});

test("critical commercial actions keep real pending feedback through completion",()=>{
  const hub=read("features/commercial-hub/commercial-hub.tsx");
  const conversion=read("features/commercial-hub/quote-conversion-review.tsx");
  const reservation=read("features/projects/components/new-project-drawer.tsx");
  const agreement=read("features/projects/signing/agreement-signing-control.tsx");
  const payments=read("features/accounts-receivable/event-payment-manager.tsx");
  assert.match(hub,/loadingLabel="PREPARANDO RESERVA…"/);
  assert.match(hub,/pending \? "Guardando…" : "Guardar borrador"/);
  assert.match(conversion,/pending \? "Creando reserva…"/);
  assert.match(reservation,/submitting && \(/);
  assert.match(reservation,/<OrbitLoader/);
  assert.match(reservation,/finally \{[\s\S]{0,80}setSubmitting\(false\)/);
  assert.match(agreement,/pending \? "Preparando…"/);
  assert.match(payments,/pending \? "Registrando…"/);
});

test("major Staff, event, finance and customer actions annotate their real pending state",()=>{
  for(const path of ["features/portal-authentication/staff-portal-dashboard.tsx","features/staff-assignment-center/staff-assignment-center.tsx","features/accounts-receivable/event-payment-manager.tsx","features/crm/customer-event-operations.tsx","features/operations/event-logistics-center.tsx","features/customer-portal/customer-design-experience.tsx"]){
    assert.match(read(path),/aria-busy=\{pending\}[\s\S]{0,80}disabled=\{pending\}|loading=\{pending(?:\s*&&[^}]+)?\}/,path);
  }
});
