const fs = require('fs');
const path = require('path');

async function testPdfjs() {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const filePath = path.join(__dirname, '..', '..', 'sample-documents', 'ir21-pdf', 'BSNLIndia_IR21_v1.pdf');
    const data = new Uint8Array(fs.readFileSync(filePath));
    
    console.log("Loading PDF with pdfjs-dist...");
    const url = require('url');
    
    // Explicitly set the worker path to avoid fake worker initialization errors
    // On Windows, ESM requires absolute paths to be file:// URLs
    const workerPath = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = url.pathToFileURL(workerPath).href;
    
    const loadingTask = pdfjsLib.getDocument({ 
      data,
      standardFontDataUrl: path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
    });
    const pdfDocument = await loadingTask.promise;
    
    console.log(`PDF Loaded. Pages: ${pdfDocument.numPages}`);
    let fullText = "";

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }

    console.log("Extracted Text Preview (first 1000 chars):");
    console.log(fullText.substring(0, 1000));
    console.log("\n... (end of preview)");

  } catch (err) {
    console.error("Failed to extract with pdfjs-dist:", err);
  }
}

testPdfjs();
