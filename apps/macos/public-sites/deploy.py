"""Publish public HTML with an exact baseline, independent config backups, and rollback."""
import argparse,base64,json,subprocess
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('baseline',type=Path)
parser.add_argument('--execute',action='store_true')
args=parser.parse_args()
root=Path(__file__).resolve().parent
before=json.loads(args.baseline.read_text())
names=['team-battle-downloads','team-battle-demo']
assert set(before)==set(names)
payload={'execute':args.execute,'sites':{name:{'before':before[name]['files'],'oldConfig':before[name]['config'],'html':base64.b64encode((root/name/'index.html').read_bytes()).decode(),'config':base64.b64encode((root/(name+'.nginx.conf')).read_bytes()).decode()} for name in names}}
remote=r'''
import base64,json,pathlib,subprocess,hashlib,uuid,os
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def manifest(root):
    assert root.is_dir() and not root.is_symlink()
    result={}
    for p in root.rglob('*'):
        assert not p.is_symlink()
        if p.is_file():result[str(p.relative_to(root))]=digest(p)
    return result
nginx='/www/server/nginx/sbin/nginx'
for name,item in cfg['sites'].items():
    root=pathlib.Path('/www/wwwroot')/name
    conf=pathlib.Path('/www/server/panel/vhost/nginx/extension/lowpower.me')/(name+'.conf')
    assert manifest(root)==item['before'],'Public files changed from baseline'
    assert not conf.is_symlink() and conf.read_bytes()==base64.b64decode(item['oldConfig']),'Site config changed'
subprocess.run([nginx,'-t'],check=True)
if not cfg['execute']:
    print(json.dumps({'preflight':True,'sites':list(cfg['sites'])}));raise SystemExit(0)
backup=pathlib.Path('/www/wwwroot')/('.team-public-seo-before-'+str(uuid.uuid4()))
backup.mkdir(mode=0o700)
changed=[]
try:
    for name,item in cfg['sites'].items():
        root=pathlib.Path('/www/wwwroot')/name
        page=root/'index.html'
        conf=pathlib.Path('/www/server/panel/vhost/nginx/extension/lowpower.me')/(name+'.conf')
        assert manifest(root)==item['before'] and conf.read_bytes()==base64.b64decode(item['oldConfig'])
        for target,new in [(page,base64.b64decode(item['html'])),(conf,base64.b64decode(item['config']))]:
            old=target.read_bytes();(backup/(name+('-index.html' if target==page else '.conf'))).write_bytes(old)
            temporary=target.with_name('.'+target.name+'.seo-'+str(uuid.uuid4()))
            temporary.write_bytes(new);temporary.chmod(target.stat().st_mode & 0o777)
            changed.append((target,old));os.replace(str(temporary),str(target))
    subprocess.run([nginx,'-t'],check=True);subprocess.run([nginx,'-s','reload'],check=True)
    for name in cfg['sites']:
        # nginx index resolution must serve the landing page without a redirect loop.
        for suffix,expected in [('/', '200'), ('/index.html', '308'), ('/index.html?seo-check=1', '308'), ('/seo-missing-check', '404')]:
            result=subprocess.check_output(['curl','--resolve','lowpower.me:443:127.0.0.1','--max-time','15','-sS','-o','/dev/null','-w','%{http_code}','https://lowpower.me/'+name+suffix]).decode()
            assert result==expected,'Unexpected public route status: '+name+suffix+' '+result
    for name,item in cfg['sites'].items():
        actual=manifest(pathlib.Path('/www/wwwroot')/name)
        expected=dict(item['before']);expected['index.html']=hashlib.sha256(base64.b64decode(item['html'])).hexdigest()
        assert actual==expected,'Unrelated published files changed'
    print(json.dumps({'published':True,'backup':str(backup),'pages':list(cfg['sites'])}))
except BaseException:
    for target,old in reversed(changed):target.write_bytes(old)
    subprocess.run([nginx,'-t'],check=True);subprocess.run([nginx,'-s','reload'],check=True)
    raise
'''
script="import json,base64\ncfg=json.loads(base64.b64decode('"+base64.b64encode(json.dumps(payload).encode()).decode()+"'))\n"+remote
subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','root@8.130.53.73','python3','-'],input=script,text=True,check=True)
