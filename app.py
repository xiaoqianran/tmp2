"""Local NiceGUI PDF inspector. No GPU, CDN or external service."""
import json
import tempfile
import uuid
from pathlib import Path

import pdfplumber
from fastapi import File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from nicegui import app, ui

ROOT = Path(__file__).resolve().parent
STORE = tempfile.TemporaryDirectory(prefix="nicegui-pdf-")
DOCUMENTS = {}
LIMIT = 150 * 1024 * 1024

app.add_static_files("/assets", ROOT / "static")
PDFJS = ROOT / "node_modules" / "pdfjs-dist" / "build"
if PDFJS.is_dir():
    app.add_static_files("/pdfjs", PDFJS)


def layout_items(items):
    return [
        {"text": obj["text"].strip(),
         "bbox": [round(float(obj[k]), 2) for k in ("x0", "top", "x1", "bottom")]}
        for obj in items if obj.get("text", "").strip()
    ]


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    if Path(file.filename or "").suffix.lower() != ".pdf":
        raise HTTPException(400, "只允许 PDF")
    identifier = uuid.uuid4().hex
    path = Path(STORE.name) / f"{identifier}.pdf"
    total = 0
    try:
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > LIMIT:
                    raise HTTPException(413, "文件不能超过 150MB")
                output.write(chunk)
        with pdfplumber.open(path) as pdf:
            count = len(pdf.pages)
            if not count:
                raise ValueError("PDF 没有页面")
        DOCUMENTS[identifier] = (path, count)
    except HTTPException:
        path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"PDF 无法读取: {exc}") from exc
    finally:
        await file.close()
    return {"id": identifier, "pages": count, "name": Path(file.filename).name}


def document(identifier):
    result = DOCUMENTS.get(identifier)
    if not result:
        raise HTTPException(404, "文档不存在")
    return result


@app.get("/api/documents/{identifier}/file")
def pdf_file(identifier: str):
    return FileResponse(document(identifier)[0], media_type="application/pdf")


@app.get("/api/documents/{identifier}/pages/{number}")
def layout(identifier: str, number: int):
    path, count = document(identifier)
    if not 1 <= number <= count:
        raise HTTPException(404, "页码无效")
    with pdfplumber.open(path, laparams={}) as pdf:
        page = pdf.pages[number - 1]
        return {
            "width": page.width, "height": page.height,
            "lines": layout_items(page.extract_text_lines(strip=True, return_chars=False)),
            "blocks": layout_items(
                page.objects.get("textboxhorizontal", [])
                + page.objects.get("textboxvertical", [])
            ),
        }


@ui.page("/")
def index():
    ui.add_head_html('<link rel="stylesheet" href="/assets/style.css">')
    ui.add_head_html('<script type="module" src="/assets/viewer.js?v=3"></script>')
    with ui.column().classes("shell gap-0"):
        with ui.row().classes("toolbar items-center gap-2"):
            ui.label("PDF · Layout Inspector").classes("brand")
            ui.button("打开 PDF", on_click=lambda: ui.run_javascript("window.pdfInspector.pick()")).props("unelevated")
            ui.button("◀", on_click=lambda: ui.run_javascript("window.pdfInspector.step(-1)")).props("flat")
            ui.button("▶", on_click=lambda: ui.run_javascript("window.pdfInspector.step(1)")).props("flat")
            ui.button("适应宽度", on_click=lambda: ui.run_javascript("window.pdfInspector.fit()")).props("flat")
            ui.button("100%", on_click=lambda: ui.run_javascript("window.pdfInspector.zoom(1)")).props("flat")
            ui.label("Ctrl+滚轮缩放 · A/D或←/→翻页 · W/S或↑/↓滚动").classes("hint")
        with ui.row().classes("workspace gap-0"):
            ui.html('<div id="scroll-area" tabindex="0"><div id="paper"><canvas id="pdf-canvas"></canvas><div id="boxes"></div></div><div id="empty">拖拽 PDF 到窗口，或点击「打开 PDF」</div></div>', sanitize=False).classes("viewer")
            with ui.column().classes("sidebar gap-3"):
                ui.label("布局结果").classes("side-title")
                ui.html('<div id="doc-status">尚未打开 PDF</div><div id="page-status"></div>', sanitize=False)
                with ui.row().classes("gap-1"):
                    ui.button("Text Lines", on_click=lambda: ui.run_javascript("window.pdfInspector.layer('lines')")).props("outline dense")
                    ui.button("LTTextBox", on_click=lambda: ui.run_javascript("window.pdfInspector.layer('blocks')")).props("outline dense")
                ui.html('<input id="search" placeholder="搜索当前页文字" aria-label="搜索文字"><div id="results"></div><pre id="details">点击检测框查看文字和坐标</pre>', sanitize=False)


ui.run(host="127.0.0.1", port=8767, reload=False, show=True, title="PDF Layout Inspector")

