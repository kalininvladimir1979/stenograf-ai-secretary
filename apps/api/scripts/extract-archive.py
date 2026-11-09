import sys,tarfile,shutil,json
from pathlib import Path
archive,target=sys.argv[1:]
root=Path(target).resolve();seen=set();total=0
with tarfile.open(archive,'r|gz') as stream:
 for member in stream:
  name=member.name
  if len(seen)>=24000: raise ValueError('Too many members')
  if not name or '\\' in name or name.startswith('/') or any(p in ('..','.') for p in name.split('/')) or name in seen: raise ValueError('Unsafe or duplicate path')
  if name not in ('manifest.json','data.json','files') and not name.startswith('files/'): raise ValueError('Unexpected entry')
  if not member.isdir() and not member.isfile(): raise ValueError('Links and special files prohibited')
  if member.size<0 or member.size>4*1024**3: raise ValueError('Oversized entry')
  if name=='manifest.json' and member.size>8*1024**2: raise ValueError('Oversized manifest')
  if name=='data.json' and member.size>200*1024**2: raise ValueError('Oversized metadata')
  total+=member.size;seen.add(name)
  if total>4*1024**3+210*1024**2: raise ValueError('Extraction limit exceeded')
  if shutil.disk_usage(root).free<member.size+64*1024**2: raise ValueError('Insufficient disk space')
  destination=root/name
  if member.isdir(): destination.mkdir(parents=True,exist_ok=True);continue
  destination.parent.mkdir(parents=True,exist_ok=True)
  with stream.extractfile(member) as source,open(destination,'xb') as output: shutil.copyfileobj(source,output,1024*1024)
if not (root/'manifest.json').is_file() or not (root/'data.json').is_file(): raise ValueError('Missing metadata')
print(json.dumps({'files':len(seen),'bytes':total}))
