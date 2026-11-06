"""Runner-only orchestration. App and browser inherit no host credentials."""
import os,json,socket,subprocess,time,pathlib,zipfile,re,signal,urllib.parse
root=pathlib.Path.cwd(); out=pathlib.Path(os.environ['QA_OUTPUT']);out.mkdir(parents=True,exist_ok=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert sha==os.environ['QA_EXPECTED_SHA']
assert set(x[4][0] for x in socket.getaddrinfo('pr183-local.supabase.co',54321))=={'127.0.0.1'}
raw={}
for line in pathlib.Path('/tmp/pr183-local.env').read_text().splitlines():
 if '=' in line:
  k,v=line.split('=',1);raw[k]=v.strip('"')
assert raw['API_URL']=='http://127.0.0.1:54321'
assert raw.get('SERVICE_ROLE_KEY') and raw.get('ANON_KEY')
for n in ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local']:
 assert not (root/n).exists(),f'Unexpected environment file: {n}'
env={'PATH':os.environ['PATH'],'HOME':os.environ['HOME'],'NODE_ENV':'development','CI':'true','NEXT_TELEMETRY_DISABLED':'1','ORBIT_ENVIRONMENT':'test','SUPABASE_URL':'http://pr183-local.supabase.co:54321','SUPABASE_PUBLISHABLE_KEY':raw['ANON_KEY'],'SUPABASE_SERVICE_ROLE_KEY':raw['SERVICE_ROLE_KEY'],'NEXT_PUBLIC_BUILD_SHA':sha,'QA_OUTPUT':str(out),'PLAYWRIGHT_BROWSERS_PATH':os.environ.get('PLAYWRIGHT_BROWSERS_PATH',str(pathlib.Path.home()/'.cache/ms-playwright'))}
subprocess.run(['sudo','useradd','--create-home','orbitqa'],check=True)
uid=subprocess.check_output(['id','-u','orbitqa'],text=True).strip();chain='ORBIT_PR183_QA';app=None
subprocess.run(['sudo','chown','-R','orbitqa',str(root),str(out),'/tmp/pr183-local.env'],check=True)
for ancestor in list(root.parents)+list(out.parents):
 subprocess.run(['sudo','chmod','o+x',str(ancestor)],check=True)
subprocess.run(['sudo','chmod','1777',str(out)],check=True)
next_package=root/'node_modules/next'
next_bin=next_package/json.loads((next_package/'package.json').read_text())['bin']['next']
assert next_bin.is_file(), 'Installed Next executable missing'
subprocess.run(['sudo','-u','orbitqa','test','-r',str(next_bin)],check=True)
env['HOME']='/home/orbitqa'
def isolated(command):return ['sudo','-u','orbitqa','env','-i']+[k+'='+v for k,v in env.items()]+command
subprocess.run(['sudo','iptables','-N',chain],check=True)
for dest in ['127.0.0.0/8','172.16.0.0/12']:
 subprocess.run(['sudo','iptables','-A',chain,'-d',dest,'-j','ACCEPT'],check=True)
subprocess.run(['sudo','iptables','-A',chain,'-j','REJECT'],check=True)
subprocess.run(['sudo','iptables','-I','OUTPUT','1','-m','owner','--uid-owner',uid,'-j',chain],check=True)
try:
 proof={'applicationCommit':env['NEXT_PUBLIC_BUILD_SHA'],'supabaseHost':'pr183-local.supabase.co','resolvedAddresses':['127.0.0.1'],'apiPort':54321,'environmentKeys':sorted(env),'outboundPolicy':'OUTPUT orbitqa UID rejects non-loopback/non-Docker addresses; browser allowlist; no repository/environment secrets passed'}
 (out/'isolation.json').write_text(json.dumps(proof,indent=2))
 with (out/'next.log').open('w') as log:
  app=subprocess.Popen(isolated(['node',str(next_bin),'dev','--hostname','127.0.0.1']),env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  import urllib.request,urllib.error
  for i in range(40):
   if app.poll() is not None:raise RuntimeError('Next process exited')
   try:urllib.request.urlopen('http://127.0.0.1:3000/login',timeout=10);break
   except urllib.error.HTTPError:break
   except Exception:
    if i%5==0:
     print('Next readiness pending; attempt '+str(i),flush=True)
     print((out/'next.log').read_text()[-4000:],flush=True)
    time.sleep(1)
  else:raise RuntimeError('Next startup timed out')
  result=subprocess.run(isolated(['node','qa/pr183/access-security.mjs']),env=env,timeout=1000)
  (out/'firewall.txt').write_text(subprocess.check_output(['sudo','iptables','-L',chain,'-n','-v'],text=True))
  code=result.returncode
finally:
 if app:
  subprocess.run(['sudo','kill','--','-'+str(app.pid)],check=False)
 subprocess.run(['sudo','iptables','-D','OUTPUT','-m','owner','--uid-owner',uid,'-j',chain],check=True)
 subprocess.run(['sudo','iptables','-F',chain],check=True);subprocess.run(['sudo','iptables','-X',chain],check=True)
 subprocess.run(['sudo','chown','-R',str(os.getuid()),str(out)],check=True)
 # Keep screenshots/snapshots, omit all network recordings and text resources.
 # Disposable local credentials and password form values are redacted from trace events/logs.
 secrets=[v for k,v in raw.items() if 'KEY' in k or 'PASSWORD' in k]+['Pr183-Synthetic-Only!2026']
 def clean(s):
  for value in secrets:
   if value:
    s=s.replace(value,'[REDACTED_LOCAL_CREDENTIAL]').replace(urllib.parse.quote(value,safe=''),'[REDACTED_LOCAL_CREDENTIAL]')
  s=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]',s)
  return s
 def scrub(value):
  if isinstance(value,list):return [scrub(v) for v in value]
  if not isinstance(value,dict):return value
  result={k:('[REDACTED]' if k.lower() in ['cookie','set-cookie','authorization','apikey','password','access_token','refresh_token'] else scrub(v)) for k,v in value.items()}
  name=str(value.get('name','')).lower()
  if name in ['cookie','set-cookie','authorization','apikey'] or name.startswith('sb-') or 'portal_session' in name:
   if 'value' in result:result['value']='[REDACTED]'
  return result
 for p in out.glob('*-raw.zip'):
  with zipfile.ZipFile(p) as src,zipfile.ZipFile(str(p).replace('-raw.zip','-trace.zip'),'w',zipfile.ZIP_DEFLATED) as dst:
   for item in src.infolist():
    if item.filename.endswith('.network') or item.filename.startswith('resources/') and not item.filename.endswith(('.png','.jpeg')):continue
    data=src.read(item)
    if item.filename.endswith(('.trace','.stacks')):
     lines=[]
     for line in clean(data.decode()).splitlines():
      try:line=json.dumps(scrub(json.loads(line)),ensure_ascii=False)
      except ValueError:pass
      lines.append(line)
     data=('\n'.join(lines)+'\n').encode()
    dst.writestr(item.filename,data)
  p.unlink()
 for p in out.glob('*.log'):p.write_text(clean(p.read_text()))
raise SystemExit(code)
