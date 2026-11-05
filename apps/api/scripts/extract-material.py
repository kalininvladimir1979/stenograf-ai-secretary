"""Local extraction only; no network or macros. Images retain page references."""
import sys, os, json, zipfile, subprocess, xml.etree.ElementTree as ET
source, name, target = sys.argv[1:4]
os.makedirs(target, exist_ok=True)
ext = name.lower().rsplit('.', 1)[-1]
text, images = [], []
if ext in ('txt', 'md', 'csv'):
    with open(source, 'rb') as f:
        data = f.read(20 * 1024 * 1024)
    try: text.append(data.decode('utf-8-sig'))
    except UnicodeDecodeError: text.append(data.decode('cp1251'))
elif ext in ('docx', 'xlsx', 'pptx'):
    with zipfile.ZipFile(source) as z:
        if sum(i.file_size for i in z.infolist()) > 150 * 1024 * 1024:
            raise ValueError('Слишком большой распакованный документ')
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            shared = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
        for entry in sorted(z.namelist()):
            if entry.startswith('xl/worksheets/') and entry.endswith('.xml'):
                rows = []
                for row in ET.fromstring(z.read(entry)).iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                    cells = []
                    for cell in row:
                        value = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        content = value.text if value is not None else ''.join(e.text or '' for e in cell.iter() if e.tag.endswith('}t'))
                        if cell.get('t') == 's' and content is not None: content = shared[int(content)]
                        cells.append(cell.get('r','')+': '+(content or ''))
                    rows.append(' | '.join(cells))
                text.append('['+entry+']\n'+'\n'.join(rows))
            elif entry.endswith('.xml') and (entry.startswith('word/document') or entry.startswith('word/header') or entry.startswith('ppt/slides/slide')):
                root = ET.fromstring(z.read(entry))
                text.append('['+entry+']\n'+' '.join(e.text for e in root.iter() if e.text and e.tag.rsplit('}', 1)[-1] in ('t', 'v')))
            if '/media/' in entry and entry.lower().endswith(('.png','.jpg','.jpeg','.webp')):
                dest = os.path.join(target, str(len(images))+os.path.splitext(entry)[1])
                with open(dest, 'wb') as f: f.write(z.read(entry))
                images.append({'path':dest, 'reference':entry})
elif ext == 'pdf':
    info = subprocess.run(['pdfinfo',source],check=True,capture_output=True,timeout=30).stdout.decode('utf-8')
    pages = int(next(line.split(':',1)[1] for line in info.splitlines() if line.startswith('Pages:')))
    if pages > 40: raise ValueError('Документ содержит более 40 страниц. Разделите его на части.')
    result = subprocess.run(['pdftotext','-layout',source,'-'], check=True, capture_output=True, timeout=90)
    text.append(result.stdout.decode('utf-8'))
    # Render every page: preserves charts and scanned pages, not just embedded bitmaps.
    subprocess.run(['pdftoppm','-scale-to','2200','-png',source,os.path.join(target,'page')],check=True,capture_output=True,timeout=180)
    images = [{'path':os.path.join(target,f),'reference':'Страница '+f.rsplit('-',1)[-1].split('.')[0]} for f in sorted(os.listdir(target)) if f.endswith('.png')]
elif ext == 'rtf':
    result = subprocess.run(['unrtf','--text',source],check=True,capture_output=True,timeout=30)
    text.append(result.stdout.decode('utf-8',errors='replace'))
else: raise ValueError('Неподдерживаемый документ')
print(json.dumps({'text':'\n\n'.join(text), 'images':images}, ensure_ascii=False))
