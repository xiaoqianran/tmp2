// Browser-only PDF rendering and interaction; Python handles layout extraction.
let pdfjs, pdf, documentId, page = 1, pages = 0;
let scale = 1.3, mode = 'lines', layout = null, generation = 0;
const $ = id => document.getElementById(id);
const view = () => $('scroll-area');
const paper = () => $('paper');
const status = msg => { if ($('doc-status')) $('doc-status').textContent = msg; };

async function engine() {
  if (!pdfjs) {
    pdfjs = await import('/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
  }
  return pdfjs;
}

async function upload(file) {
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) return status('请选择 PDF 文件');
  if (file.size > 150 * 1024 * 1024) return status('文件不能超过 150 MB');
  status('正在读取 PDF …');
  const data = new FormData();
  data.append('file', file);
  try {
    const response = await fetch('/api/upload', {method:'POST', body:data});
    if (!response.ok) throw Error((await response.json()).detail || response.statusText);
    const info = await response.json();
    await load(info);
  } catch (error) { status('打开失败：' + error.message); }
}

async function load(info) {
  documentId = info.id;
  pages = info.pages;
  page = 1;
  const lib = await engine();
  pdf = await lib.getDocument('/api/documents/' + documentId + '/file').promise;
  status(info.name);
  $('empty').style.display = 'none';
  paper().style.display = 'block';
  await fit();
}

async function draw() {
  if (!pdf) return;
  const current = ++generation;
  const p = await pdf.getPage(page);
  const viewport = p.getViewport({scale});
  const canvas = $('pdf-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(viewport.width * dpr);
  canvas.height = Math.round(viewport.height * dpr);
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  paper().style.width = viewport.width + 'px';
  const rendering = p.render({canvasContext:ctx,viewport,transform:[dpr,0,0,dpr,0,0]});
  const response = await fetch('/api/documents/'+documentId+'/pages/'+page);
  if (!response.ok) throw Error('布局数据读取失败');
  const result = await response.json();
  try { await rendering.promise; } catch(error) { if (current === generation) throw error; }
  if (current !== generation) return;
  layout = result;
  $('page-status').textContent = '第 '+page+' / '+pages+' 页 · '+(layout.lines?.length || 0)+' 行';
  overlays();
}

function overlays() {
  if (!layout) return;
  const layer = $('boxes'), results = $('results');
  layer.replaceChildren();
  results.replaceChildren();
  const items = layout[mode] || [];
  const search = $('search').value.trim().toLowerCase();
  const width = paper().getBoundingClientRect().width;
  const height = $('pdf-canvas').getBoundingClientRect().height;
  // pdfplumber top-based coordinates; PDF.js viewport follows page rotation.
  items.forEach((item,index) => {
    const [x0,y0,x1,y1] = item.bbox;
    const box = document.createElement('div');
    box.className = 'pdf-box';
    box.style.left = (x0/layout.width*width) + 'px';
    box.style.top = (y0/layout.height*height) + 'px';
    box.style.width = ((x1-x0)/layout.width*width) + 'px';
    box.style.height = ((y1-y0)/layout.height*height) + 'px';
    box.title = item.text;
    layer.append(box);
    const select = () => {
      layer.querySelectorAll('.active').forEach(node => node.classList.remove('active'));
      box.classList.add('active');
      $('details').textContent = item.text+'\n\nBBox: '+JSON.stringify(item.bbox);
    };
    box.addEventListener('click', select);
    if (!search || item.text.toLowerCase().includes(search)) {
      const row = document.createElement('div');
      row.className = 'result';
      row.textContent = (index+1)+'. '+item.text;
      row.addEventListener('click', () => { select(); box.scrollIntoView({block:'center',inline:'center'}); });
      results.append(row);
    }
  });
}

async function go(next) {
  if (!pdf) return;
  page = Math.max(1, Math.min(pages, next));
  try { await draw(); } catch(error) { status(error.message); }
}
async function fit() {
  if (!pdf) return;
  const p = await pdf.getPage(page);
  const size = p.getViewport({scale:1});
  scale = Math.max(.2, (view().clientWidth-70)/size.width);
  await go(page);
}
async function setZoom(value, clientX, clientY) {
  if (!pdf) return;
  const area = view(), old = scale;
  scale = Math.max(.25, Math.min(5, value));
  if (Math.abs(old-scale)<0.001) return;
  const bounds = area.getBoundingClientRect();
  const x = (clientX ?? (bounds.left + bounds.width/2)) - bounds.left;
  const y = (clientY ?? (bounds.top + bounds.height/2)) - bounds.top;
  const docX = area.scrollLeft + x, docY = area.scrollTop + y;
  await draw();
  area.scrollLeft = docX * (scale/old) - x;
  area.scrollTop = docY * (scale/old) - y;
}
window.pdfInspector = {
  pick: () => $('pdf-input').click(),
  step: delta => go(page+delta),
  fit,
  zoom: setZoom,
  layer: value => { mode=value; overlays(); },
  load,
};

function setup() {
  if (!$('scroll-area')) { setTimeout(setup,100); return; }
  const input = document.createElement('input');
  input.id = 'pdf-input';
  input.type = 'file'; input.accept = '.pdf,application/pdf';
  input.hidden = true;
  document.body.append(input);
  input.onchange = () => { upload(input.files[0]); input.value=''; };
  $('search').addEventListener('input', overlays);
  window.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
  window.addEventListener('drop', event => {
    if (![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault(); upload(event.dataTransfer.files[0]);
  });
  view().addEventListener('wheel', event => {
    if (!event.ctrlKey || !pdf) return;
    event.preventDefault();
    setZoom(scale * (event.deltaY<0 ? 1.1 : 1/1.1), event.clientX,event.clientY);
  }, {passive:false});
  window.addEventListener('keydown', event => {
    if (!pdf || ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
      event.preventDefault(); go(page - 1); return;
    }
    if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') {
      event.preventDefault(); go(page + 1); return;
    }
    const dy = {w:-80,W:-80,ArrowUp:-80,s:80,S:80,ArrowDown:80}[event.key];
    if (dy !== undefined) {
      event.preventDefault(); view().scrollBy({top:dy});
    }
  });
}
setup();
