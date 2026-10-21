# tmp2 · NiceGUI PDF Layout Inspector

独立于 [tmp](https://github.com/xiaoqianran/tmp) 的 NiceGUI 版本。Windows CPU 运行，**无 GPU / Modal / CDN**。NiceGUI 负责 UI、pdfplumber 负责解析、浏览器本地 PDF.js 负责 PDF 渲染和覆盖框。

## Windows 首次安装

需要 Python 3.11+；安装 PDF.js 静态依赖时**仅首次**需要 Node.js/npm（运行程序时无需 Node.js）。

```powershell
python -m pip install -r requirements.txt
npm install
python app.py
```

打开 http://127.0.0.1:8766 。以后启动只需 `python app.py`。

## 功能

- 整个窗口支持拖拽 PDF，也支持「打开 PDF」按钮；文件仅上传到本机回环地址
- PDF.js 正常绘制 PDF 页面，pdfplumber 提取 **Text Lines** 和 **LTTextBox** 坐标并叠框
- Ctrl+鼠标滚轮缩放、WASD/方向键滚动、Alt+左右方向键翻页
- 文字搜索、点击检测框查看文字与 bbox、适应宽度与 100% 缩放
- 默认只监听 `127.0.0.1`，PDF 临时文件随进程退出清理

## 设计边界

这个实验仓库仅验证 NiceGUI 的开发简洁度，不改动原来的 tmp，也不实现 OCR、表格重建或字段匹配。旋转页、特殊 CropBox 的叠框坐标可能需要额外校准。第一次运行需 `npm install` 将 PDF.js 保存在本地；没有设置 CDN 退路。

当前只提交了静态代码，尚未在真实 Windows 浏览器中完成自动化交互回归，不能视为已验证的稳定发布版。
