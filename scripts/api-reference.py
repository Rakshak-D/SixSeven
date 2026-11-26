# Prints the API reference for docs/HANDBOOK.md from the OpenAPI document.
# Usage: curl -s localhost:3000/api/v1/doc > /tmp/openapi.json && python3 scripts/api-reference.py /tmp/openapi.json
import json,sys
d=json.load(open(sys.argv[1])); comps=d.get('components',{}).get('schemas',{})
def res(s):
    while isinstance(s,dict) and '$ref' in s: s=comps[s['$ref'].split('/')[-1]]
    return s or {}
def ty(s,depth=0):
    s=res(s)
    if 'enum' in s: return ' \\| '.join('`'+(e if isinstance(e,str) else json.dumps(e))+'`' for e in s['enum'][:9])
    if "const" in s: return "`"+json.dumps(s["const"])+"`"
    for k in ('anyOf','oneOf'):
        if k in s: return ' or '.join(ty(x,depth) for x in s[k][:3])
    if 'allOf' in s: return ty(s['allOf'][0],depth)
    t=s.get('type')
    if isinstance(t,list): t='/'.join(t)
    if t=='array': return f"{ty(s.get('items',{}),depth)}[]"
    if t=='object' and s.get('properties') and depth<1: return '{ '+', '.join(f"{k}{'' if k in s.get('required',[]) else '?'}: {ty(v,depth+1)}" for k,v in s['properties'].items())+' }'
    if t=='object': return 'object'
    if s.get('format') in ('binary',): return 'file'
    return t or 'any'
def fields(s):
    s=res(s)
    for k in ('anyOf','oneOf'):
        if k in s: return ' **or** '.join(fields(x) for x in s[k])
    if s.get('type')=='array': return f"array of {fields(s.get('items',{}))}"
    p=s.get('properties')
    if not p: return ty(s)
    return '{ '+', '.join(f"{k}{'' if k in s.get('required',[]) else '?'}: {ty(v,1)}" for k,v in p.items())+' }'
out=[]
for path,ops in d['paths'].items():
    for m,op in ops.items():
        if m not in ('get','post','put','patch','delete'): continue
        out.append(f"#### `{m.upper()} {path.replace('/api/v1','')}`")
        q=[p for p in op.get('parameters',[]) if p.get('in')=='query']
        if q: out.append('- **Query:** '+', '.join(f"{p['name']}{'' if p.get('required') else '?'}: {ty(p.get('schema',{}))}" for p in q))
        body=op.get('requestBody',{}).get('content',{})
        for ct,c in body.items():
            out.append(f"- **Body** ({'multipart' if 'multipart' in ct else 'JSON'}): {fields(c.get('schema',{}))}")
        for code,r in op.get('responses',{}).items():
            if not code.startswith('2'): continue
            c=r.get('content',{})
            sch=next(iter(c.values()),{}).get('schema') if c else None
            kind=next(iter(c.keys()),'') if c else ''
            out.append(f"- **{code}**{' ('+kind+')' if kind and 'json' not in kind else ''}: {fields(sch) if sch and 'json' in kind else r.get('description','')}")
        errs=[c for c in op.get('responses',{}) if not c.startswith('2')]
        if errs: out.append('- **Errors:** '+', '.join(errs))
        out.append('')
print('\n'.join(out))
